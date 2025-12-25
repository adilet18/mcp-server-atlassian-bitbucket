import { Logger } from './logger.util.js';
import { config } from './config.util.js';
import { NETWORK_TIMEOUTS, DATA_LIMITS } from './constants.util.js';
import {
	createAuthInvalidError,
	createApiError,
	createUnexpectedError,
	McpError,
} from './error.util.js';

/**
 * Interface for Atlassian API credentials
 */
export interface AtlassianCredentials {
	// OAuth Bearer token (highest priority)
	oauthToken?: string;
	useOAuth?: boolean;
	// Standard Atlassian credentials
	siteName?: string;
	userEmail?: string;
	apiToken?: string;
	// Bitbucket-specific credentials (alternative approach)
	bitbucketUsername?: string;
	bitbucketAppPassword?: string;
	// Indicates which auth method to use
	useBitbucketAuth?: boolean;
}

/**
 * Interface for HTTP request options
 */
export interface RequestOptions {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
	headers?: Record<string, string>;
	body?: unknown;
	timeout?: number;
}

// Create a contextualized logger for this file
const transportLogger = Logger.forContext('utils/transport.util.ts');

// Log transport utility initialization
transportLogger.debug('Transport utility initialized');

/**
 * Get Atlassian credentials from environment variables
 * @returns AtlassianCredentials object or null if credentials are missing
 */
export function getAtlassianCredentials(): AtlassianCredentials | null {
	const methodLogger = Logger.forContext(
		'utils/transport.util.ts',
		'getAtlassianCredentials',
	);

	// First try OAuth Bearer token (highest priority for OAuth flow)
	const oauthToken =
		config.get('BITBUCKET_ACCESS_TOKEN') ||
		config.get('BITBUCKET_OAUTH_TOKEN');
	if (oauthToken) {
		methodLogger.debug('Using OAuth Bearer token');
		return {
			oauthToken,
			useOAuth: true,
		};
	}

	// Second try standard Atlassian credentials (preferred for consistency)
	const siteName = config.get('ATLASSIAN_SITE_NAME');
	const userEmail = config.get('ATLASSIAN_USER_EMAIL');
	const apiToken = config.get('ATLASSIAN_API_TOKEN');

	// If standard credentials are available, use them
	if (userEmail && apiToken) {
		methodLogger.debug('Using standard Atlassian credentials');
		return {
			siteName,
			userEmail,
			apiToken,
			useBitbucketAuth: false,
		};
	}

	// If standard credentials are not available, try Bitbucket-specific credentials
	const bitbucketUsername = config.get('ATLASSIAN_BITBUCKET_USERNAME');
	const bitbucketAppPassword = config.get('ATLASSIAN_BITBUCKET_APP_PASSWORD');

	if (bitbucketUsername && bitbucketAppPassword) {
		methodLogger.debug('Using Bitbucket-specific credentials');
		return {
			bitbucketUsername,
			bitbucketAppPassword,
			useBitbucketAuth: true,
		};
	}

	// If neither set of credentials is available, return null
	methodLogger.warn(
		'Missing Atlassian credentials. Please set either BITBUCKET_ACCESS_TOKEN (OAuth), ATLASSIAN_USER_EMAIL and ATLASSIAN_API_TOKEN, or ATLASSIAN_BITBUCKET_USERNAME and ATLASSIAN_BITBUCKET_APP_PASSWORD.',
	);
	return null;
}

/**
 * Fetch data from Atlassian API
 * @param credentials Atlassian API credentials
 * @param path API endpoint path (without base URL)
 * @param options Request options
 * @returns Response data
 */
export async function fetchAtlassian<T>(
	credentials: AtlassianCredentials,
	path: string,
	options: RequestOptions = {},
): Promise<T> {
	const methodLogger = Logger.forContext(
		'utils/transport.util.ts',
		'fetchAtlassian',
	);

	const baseUrl = 'https://api.bitbucket.org';

	// Set up auth headers based on credential type
	let authHeader: string;

	if (credentials.useOAuth) {
		// OAuth Bearer token authentication
		if (!credentials.oauthToken) {
			throw createAuthInvalidError('Missing OAuth token');
		}
		authHeader = `Bearer ${credentials.oauthToken}`;
	} else if (credentials.useBitbucketAuth) {
		// Bitbucket API uses a different auth format
		if (
			!credentials.bitbucketUsername ||
			!credentials.bitbucketAppPassword
		) {
			throw createAuthInvalidError(
				'Missing Bitbucket username or app password',
			);
		}
		authHeader = `Basic ${Buffer.from(
			`${credentials.bitbucketUsername}:${credentials.bitbucketAppPassword}`,
		).toString('base64')}`;
	} else {
		// Standard Atlassian API (Jira, Confluence)
		if (!credentials.userEmail || !credentials.apiToken) {
			throw createAuthInvalidError('Missing Atlassian credentials');
		}
		authHeader = `Basic ${Buffer.from(
			`${credentials.userEmail}:${credentials.apiToken}`,
		).toString('base64')}`;
	}

	// Ensure path starts with a slash
	const normalizedPath = path.startsWith('/') ? path : `/${path}`;

	// Construct the full URL
	const url = `${baseUrl}${normalizedPath}`;

	// Set up authentication and headers
	// Allow Content-Type to be overridden by options.headers
	const defaultContentType =
		options.headers?.['Content-Type'] || 'application/json';
	const headers = {
		Authorization: authHeader,
		'Content-Type': defaultContentType,
		Accept: 'application/json',
		...options.headers,
	};

	// Prepare request body
	// Handle different body types: string or JSON object
	let requestBody: string | undefined;
	if (options.body) {
		if (typeof options.body === 'string') {
			requestBody = options.body;
		} else if (headers['Content-Type']?.includes('multipart/form-data')) {
			// Multipart form data is already a string with boundary
			requestBody = options.body as string;
		} else if (
			headers['Content-Type'] === 'application/x-www-form-urlencoded'
		) {
			requestBody = options.body as string;
		} else {
			requestBody = JSON.stringify(options.body);
		}
	}

	// Prepare request options
	const requestOptions: RequestInit = {
		method: options.method || 'GET',
		headers,
		body: requestBody,
	};

	methodLogger.debug(`Calling Atlassian API: ${url}`);

	// Set up timeout handling with configurable values
	const defaultTimeout = config.getNumber(
		'ATLASSIAN_REQUEST_TIMEOUT',
		NETWORK_TIMEOUTS.DEFAULT_REQUEST_TIMEOUT,
	);
	const timeoutMs = options.timeout ?? defaultTimeout;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => {
		methodLogger.warn(`Request timeout after ${timeoutMs}ms: ${url}`);
		controller.abort();
	}, timeoutMs);

	// Add abort signal to request options
	requestOptions.signal = controller.signal;

	try {
		const response = await fetch(url, requestOptions);
		clearTimeout(timeoutId);

		// Log the raw response status and headers
		methodLogger.debug(
			`Raw response received: ${response.status} ${response.statusText}`,
			{
				url,
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers.entries()),
			},
		);

		// Validate response size to prevent excessive memory usage (CWE-770)
		const contentLength = response.headers.get('content-length');
		if (contentLength) {
			const responseSize = parseInt(contentLength, 10);
			if (responseSize > DATA_LIMITS.MAX_RESPONSE_SIZE) {
				methodLogger.warn(
					`Response size ${responseSize} bytes exceeds limit of ${DATA_LIMITS.MAX_RESPONSE_SIZE} bytes`,
				);
				throw createApiError(
					`Response size (${Math.round(responseSize / (1024 * 1024))}MB) exceeds maximum limit of ${Math.round(DATA_LIMITS.MAX_RESPONSE_SIZE / (1024 * 1024))}MB`,
					413,
					{ responseSize, limit: DATA_LIMITS.MAX_RESPONSE_SIZE },
				);
			}
		}

		if (!response.ok) {
			const errorText = await response.text();
			methodLogger.error(
				`API error: ${response.status} ${response.statusText}`,
				errorText,
			);

			// Try to parse the error response
			let errorMessage = `${response.status} ${response.statusText}`;
			let parsedBitbucketError = null;

			try {
				if (
					errorText &&
					(errorText.startsWith('{') || errorText.startsWith('['))
				) {
					const parsedError = JSON.parse(errorText);

					// Extract specific error details from various Bitbucket API response formats
					if (
						parsedError.type === 'error' &&
						parsedError.error &&
						parsedError.error.message
					) {
						// Format: {"type":"error", "error":{"message":"...", "detail":"..."}}
						parsedBitbucketError = parsedError.error;
						errorMessage = parsedBitbucketError.message;
						if (parsedBitbucketError.detail) {
							errorMessage += ` Detail: ${parsedBitbucketError.detail}`;
						}
					} else if (parsedError.error && parsedError.error.message) {
						// Alternative error format: {"error": {"message": "..."}}
						parsedBitbucketError = parsedError.error;
						errorMessage = parsedBitbucketError.message;
					} else if (
						parsedError.errors &&
						Array.isArray(parsedError.errors) &&
						parsedError.errors.length > 0
					) {
						// Format: {"errors":[{"status":400,"code":"INVALID_REQUEST_PARAMETER","title":"..."}]}
						const atlassianError = parsedError.errors[0];
						if (atlassianError.title) {
							errorMessage = atlassianError.title;
							parsedBitbucketError = atlassianError;
						}
					} else if (parsedError.message) {
						// Format: {"message":"Some error message"}
						errorMessage = parsedError.message;
						parsedBitbucketError = parsedError;
					}
				}
			} catch (parseError) {
				methodLogger.debug(`Error parsing error response:`, parseError);
				// Fall back to the default error message
			}

			// Log the parsed error or raw error text
			methodLogger.debug(
				'Parsed Bitbucket error:',
				parsedBitbucketError || errorText,
			);

			// Use parsedBitbucketError (or errorText if parsing failed) as originalError
			const originalErrorForMcp = parsedBitbucketError || errorText;

			// Handle common Bitbucket API error status codes
			if (response.status === 401) {
				throw createAuthInvalidError(
					`Bitbucket API: Authentication failed - ${errorMessage}`,
					originalErrorForMcp,
				);
			}

			if (response.status === 403) {
				throw createApiError(
					`Bitbucket API: Permission denied - ${errorMessage}`,
					403,
					originalErrorForMcp,
				);
			}

			if (response.status === 404) {
				throw createApiError(
					`Bitbucket API: Resource not found - ${errorMessage}`,
					404,
					originalErrorForMcp,
				);
			}

			if (response.status === 429) {
				throw createApiError(
					`Bitbucket API: Rate limit exceeded - ${errorMessage}`,
					429,
					originalErrorForMcp,
				);
			}

			if (response.status >= 500) {
				throw createApiError(
					`Bitbucket API: Service error - ${errorMessage}`,
					response.status,
					originalErrorForMcp,
				);
			}

			// For other API errors, preserve the original vendor message
			throw createApiError(
				`Bitbucket API Error: ${errorMessage}`,
				response.status,
				originalErrorForMcp,
			);
		}

		// Check if the response is expected to be plain text
		const contentType = response.headers.get('content-type') || '';
		if (contentType.includes('text/plain')) {
			// If we're expecting text (like a diff), return the raw text
			const textResponse = await response.text();
			methodLogger.debug(
				`Text response received (truncated)`,
				textResponse.substring(0, 200) + '...',
			);
			return textResponse as unknown as T;
		}

		// For JSON responses, proceed as before
		// Clone the response to log its content without consuming it
		const clonedResponse = response.clone();
		const responseText = await clonedResponse.text();

		// Handle empty response (some APIs return empty body on success)
		if (!responseText || responseText.trim() === '') {
			methodLogger.debug('Empty response body received');
			// Return a minimal success object if response is empty
			return {} as T;
		}

		try {
			const responseJson = JSON.parse(responseText);
			methodLogger.debug(`Response body:`, responseJson);
			return responseJson as T;
		} catch (parseError) {
			methodLogger.debug(
				`Could not parse response as JSON: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
			);
			methodLogger.debug(
				`Response text (first 500 chars):`,
				responseText.substring(0, 500),
			);
			// If it's not JSON, return as text (for text/plain responses)
			return responseText as unknown as T;
		}
	} catch (error) {
		clearTimeout(timeoutId);
		methodLogger.error(`Request failed`, error);

		// If it's already an McpError, just rethrow it
		if (error instanceof McpError) {
			throw error;
		}

		// Handle timeout errors
		if (error instanceof Error && error.name === 'AbortError') {
			methodLogger.error(
				`Request timed out after ${timeoutMs}ms: ${url}`,
			);
			throw createApiError(
				`Request timeout: Bitbucket API did not respond within ${timeoutMs / 1000} seconds`,
				408,
				error,
			);
		}

		// Handle network errors more explicitly
		if (error instanceof TypeError) {
			// TypeError is typically a network/fetch error in this context
			const errorMessage = error.message || 'Network error occurred';
			methodLogger.debug(`Network error details: ${errorMessage}`);

			throw createApiError(
				`Network error while calling Bitbucket API: ${errorMessage}`,
				500, // This will be classified as NETWORK_ERROR by detectErrorType
				error,
			);
		}

		// Handle JSON parsing errors
		if (error instanceof SyntaxError) {
			methodLogger.debug(`JSON parsing error: ${error.message}`);
			// If it's "Unexpected end of JSON input", it might be an empty response
			// which is valid for some Bitbucket API endpoints
			if (error.message.includes('Unexpected end of JSON input')) {
				methodLogger.debug(
					'Empty JSON response detected, treating as success',
				);
				return {} as T;
			}
			throw createApiError(
				`Invalid response format from Bitbucket API: ${error.message}`,
				500,
				error,
			);
		}

		// Generic error handler for any other types of errors
		throw createUnexpectedError(
			`Unexpected error while calling Bitbucket API: ${error instanceof Error ? error.message : String(error)}`,
			error,
		);
	}
}
