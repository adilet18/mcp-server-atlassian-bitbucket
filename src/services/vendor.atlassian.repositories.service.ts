import { z } from 'zod';
import {
	createAuthMissingError,
	createApiError,
	McpError,
} from '../utils/error.util.js';
import { Logger } from '../utils/logger.util.js';
import {
	fetchAtlassian,
	getAtlassianCredentials,
} from '../utils/transport.util.js';
import {
	validatePageSize,
	validatePaginationLimits,
} from '../utils/pagination.util.js';
import {
	ListRepositoriesParamsSchema,
	GetRepositoryParamsSchema,
	ListCommitsParamsSchema,
	RepositoriesResponseSchema,
	RepositorySchema,
	PaginatedCommitsSchema,
	CreateBranchParamsSchema,
	BranchRefSchema,
	GetFileContentParamsSchema,
	type ListRepositoriesParams,
	type GetRepositoryParams,
	type ListCommitsParams,
	type Repository,
	type CreateBranchParams,
	type BranchRef,
	type GetFileContentParams,
	ListBranchesParamsSchema,
	BranchesResponseSchema,
	type ListBranchesParams,
	type BranchesResponse,
	CreateOrUpdateFileParamsSchema,
	FileOperationResponseSchema,
	type CreateOrUpdateFileParams,
	type FileOperationResponse,
} from './vendor.atlassian.repositories.types.js';

/**
 * Base API path for Bitbucket REST API v2
 * @see https://developer.atlassian.com/cloud/bitbucket/rest/api-group-repositories/
 * @constant {string}
 */
const API_PATH = '/2.0';

/**
 * @namespace VendorAtlassianRepositoriesService
 * @description Service for interacting with Bitbucket Repositories API.
 * Provides methods for listing repositories and retrieving repository details.
 * All methods require valid Atlassian credentials configured in the environment.
 */

// Create a contextualized logger for this file
const serviceLogger = Logger.forContext(
	'services/vendor.atlassian.repositories.service.ts',
);

// Log service initialization
serviceLogger.debug('Bitbucket repositories service initialized');

/**
 * List repositories for a workspace
 * @param {string} workspace - Workspace name or UUID
 * @param {ListRepositoriesParams} [params={}] - Optional parameters
 * @param {string} [params.q] - Query string to filter repositories
 * @param {string} [params.sort] - Property to sort by (e.g., 'name', '-created_on')
 * @param {number} [params.page] - Page number for pagination
 * @param {number} [params.pagelen] - Number of items per page
 * @returns {Promise<RepositoriesResponse>} Response containing repositories
 * @example
 * ```typescript
 * // List repositories in a workspace, filtered and sorted
 * const response = await listRepositories('myworkspace', {
 *   q: 'name~"api"',
 *   sort: 'name',
 *   pagelen: 25
 * });
 * ```
 */
async function list(
	params: ListRepositoriesParams,
): Promise<z.infer<typeof RepositoriesResponseSchema>> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'list',
	);
	methodLogger.debug('Listing Bitbucket repositories with params:', params);

	// Validate params with Zod
	try {
		ListRepositoriesParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error(
				'Invalid parameters provided to list repositories:',
				error.format(),
			);
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	// Construct query parameters
	const queryParams = new URLSearchParams();

	// Add optional query parameters
	if (params.q) {
		queryParams.set('q', params.q);
	}
	if (params.sort) {
		queryParams.set('sort', params.sort);
	}
	if (params.role) {
		queryParams.set('role', params.role);
	}

	// Validate and enforce page size limits (CWE-770)
	const validatedPagelen = validatePageSize(
		params.pagelen,
		'listRepositories',
	);
	queryParams.set('pagelen', validatedPagelen.toString());

	if (params.page) {
		queryParams.set('page', params.page.toString());
	}

	const queryString = queryParams.toString()
		? `?${queryParams.toString()}`
		: '';
	const path = `${API_PATH}/repositories/${params.workspace}${queryString}`;

	methodLogger.debug(`Sending request to: ${path}`);
	try {
		const rawData = await fetchAtlassian(credentials, path);
		// Validate response with Zod schema
		try {
			const validatedData = RepositoriesResponseSchema.parse(rawData);

			// Validate pagination limits to prevent excessive data exposure (CWE-770)
			if (!validatePaginationLimits(validatedData, 'listRepositories')) {
				methodLogger.warn(
					'Response pagination exceeds configured limits',
				);
			}

			return validatedData;
		} catch (error) {
			if (error instanceof z.ZodError) {
				methodLogger.error(
					'Invalid response from Bitbucket API:',
					error.format(),
				);
				throw createApiError(
					'Received invalid response format from Bitbucket API',
					500,
					error,
				);
			}
			throw error;
		}
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}
		throw createApiError(
			`Failed to list repositories: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

/**
 * Get detailed information about a specific Bitbucket repository
 *
 * Retrieves comprehensive details about a single repository.
 *
 * @async
 * @memberof VendorAtlassianRepositoriesService
 * @param {GetRepositoryParams} params - Parameters for the request
 * @param {string} params.workspace - The workspace slug
 * @param {string} params.repo_slug - The repository slug
 * @returns {Promise<Repository>} Promise containing the detailed repository information
 * @throws {Error} If Atlassian credentials are missing or API request fails
 * @example
 * // Get repository details
 * const repository = await get({
 *   workspace: 'my-workspace',
 *   repo_slug: 'my-repo'
 * });
 */
async function get(params: GetRepositoryParams): Promise<Repository> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'get',
	);
	methodLogger.debug(
		`Getting Bitbucket repository: ${params.workspace}/${params.repo_slug}`,
	);

	// Validate params with Zod
	try {
		GetRepositoryParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error(
				'Invalid parameters provided to get repository:',
				error.format(),
			);
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	const path = `${API_PATH}/repositories/${params.workspace}/${params.repo_slug}`;

	methodLogger.debug(`Sending request to: ${path}`);
	try {
		const rawData = await fetchAtlassian(credentials, path);

		// Validate response with Zod schema
		try {
			const validatedData = RepositorySchema.parse(rawData);
			return validatedData;
		} catch (error) {
			if (error instanceof z.ZodError) {
				// Log the detailed formatting errors but provide a clear message to users
				methodLogger.error(
					'Bitbucket API response validation failed:',
					error.format(),
				);

				// Create API error with appropriate context for validation failures
				throw createApiError(
					`Invalid response format from Bitbucket API for repository ${params.workspace}/${params.repo_slug}`,
					500, // Internal server error since the API responded but with unexpected format
					error, // Include the Zod error as originalError for better debugging
				);
			}
			throw error; // Re-throw any other errors
		}
	} catch (error) {
		// If it's already an McpError (from fetchAtlassian or Zod validation), just rethrow it
		if (error instanceof McpError) {
			throw error;
		}

		// Otherwise, wrap in a standard API error with context
		throw createApiError(
			`Failed to get repository details for ${params.workspace}/${params.repo_slug}: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

/**
 * Lists commits for a specific repository and optional revision/path.
 *
 * @param params Parameters including workspace, repo slug, and optional filters.
 * @returns Promise resolving to paginated commit data.
 * @throws {Error} If workspace or repo_slug are missing, or if credentials are not found.
 */
async function listCommits(
	params: ListCommitsParams,
): Promise<z.infer<typeof PaginatedCommitsSchema>> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'listCommits',
	);
	methodLogger.debug(
		`Listing commits for ${params.workspace}/${params.repo_slug}`,
		params,
	);

	// Validate params with Zod
	try {
		ListCommitsParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error(
				'Invalid parameters provided to list commits:',
				error.format(),
			);
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	const queryParams = new URLSearchParams();
	if (params.include) {
		queryParams.set('include', params.include);
	}
	if (params.exclude) {
		queryParams.set('exclude', params.exclude);
	}
	if (params.path) {
		queryParams.set('path', params.path);
	}
	if (params.pagelen) {
		queryParams.set('pagelen', params.pagelen.toString());
	}
	if (params.page) {
		queryParams.set('page', params.page.toString());
	}

	const queryString = queryParams.toString()
		? `?${queryParams.toString()}`
		: '';
	const path = `${API_PATH}/repositories/${params.workspace}/${params.repo_slug}/commits${queryString}`;

	methodLogger.debug(`Sending commit history request to: ${path}`);
	try {
		const rawData = await fetchAtlassian(credentials, path);
		// Validate response with Zod schema
		try {
			const validatedData = PaginatedCommitsSchema.parse(rawData);
			return validatedData;
		} catch (error) {
			if (error instanceof z.ZodError) {
				methodLogger.error(
					'Invalid response from Bitbucket API:',
					error.format(),
				);
				throw createApiError(
					'Received invalid response format from Bitbucket API',
					500,
					error,
				);
			}
			throw error;
		}
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}
		throw createApiError(
			`Failed to list commits: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

/**
 * Creates a new branch in the specified repository.
 *
 * @param params Parameters including workspace, repo slug, new branch name, and source target.
 * @returns Promise resolving to details about the newly created branch reference.
 * @throws {Error} If required parameters are missing or API request fails.
 */
async function createBranch(params: CreateBranchParams): Promise<BranchRef> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'createBranch',
	);
	methodLogger.debug(
		`Creating branch '${params.name}' from target '${params.target.hash}' in ${params.workspace}/${params.repo_slug}`,
	);

	// Validate params with Zod
	try {
		CreateBranchParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error('Invalid parameters provided:', error.format());
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	const path = `${API_PATH}/repositories/${params.workspace}/${params.repo_slug}/refs/branches`;

	const requestBody = {
		name: params.name,
		target: {
			hash: params.target.hash,
		},
	};

	methodLogger.debug(`Sending POST request to: ${path}`);
	try {
		const rawData = await fetchAtlassian<BranchRef>(credentials, path, {
			method: 'POST',
			body: requestBody,
		});

		// Validate response with Zod schema
		try {
			const validatedData = BranchRefSchema.parse(rawData);
			methodLogger.debug('Branch created successfully:', validatedData);
			return validatedData;
		} catch (error) {
			if (error instanceof z.ZodError) {
				methodLogger.error(
					'Invalid response from Bitbucket API:',
					error.format(),
				);
				throw createApiError(
					'Received invalid response format from Bitbucket API',
					500,
					error,
				);
			}
			throw error;
		}
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}
		throw createApiError(
			`Failed to create branch: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

/**
 * Get the content of a file from a repository.
 *
 * This retrieves the raw content of a file at the specified path from a repository at a specific commit.
 *
 * @param {GetFileContentParams} params - Parameters for the request
 * @param {string} params.workspace - The workspace slug or UUID
 * @param {string} params.repo_slug - The repository slug or UUID
 * @param {string} params.commit - The commit, branch name, or tag to get the file from
 * @param {string} params.path - The file path within the repository
 * @returns {Promise<string>} Promise containing the file content as a string
 * @throws {Error} If parameters are invalid, credentials are missing, or API request fails
 * @example
 * // Get README.md content from the main branch
 * const fileContent = await getFileContent({
 *   workspace: 'my-workspace',
 *   repo_slug: 'my-repo',
 *   commit: 'main',
 *   path: 'README.md'
 * });
 */
async function getFileContent(params: GetFileContentParams): Promise<string> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'getFileContent',
	);
	methodLogger.debug(
		`Getting file content from ${params.workspace}/${params.repo_slug}/${params.commit}/${params.path}`,
	);

	// Validate params with Zod
	try {
		GetFileContentParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error(
				'Invalid parameters provided to get file content:',
				error.format(),
			);
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	const path = `${API_PATH}/repositories/${params.workspace}/${params.repo_slug}/src/${params.commit}/${params.path}`;

	methodLogger.debug(`Sending request to: ${path}`);
	try {
		// Use fetchAtlassian to get the file content directly as string
		// The function already detects text/plain content type and returns it appropriately
		const fileContent = await fetchAtlassian<string>(credentials, path);

		methodLogger.debug(
			`Successfully retrieved file content (${fileContent.length} characters)`,
		);
		return fileContent;
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}

		// More specific error messages for common file issues
		if (error instanceof Error && error.message.includes('404')) {
			throw createApiError(
				`File not found: ${params.path} at ${params.commit}`,
				404,
				error,
			);
		}

		throw createApiError(
			`Failed to get file content: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

/**
 * Lists branches for a specific repository.
 *
 * @param params Parameters including workspace, repo slug, and optional filters.
 * @returns Promise resolving to paginated branches data.
 * @throws {Error} If workspace or repo_slug are missing, or if credentials are not found.
 */
async function listBranches(
	params: ListBranchesParams,
): Promise<BranchesResponse> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'listBranches',
	);
	methodLogger.debug(
		`Listing branches for ${params.workspace}/${params.repo_slug}`,
		params,
	);

	// Validate params with Zod
	try {
		ListBranchesParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error(
				'Invalid parameters provided to list branches:',
				error.format(),
			);
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	const queryParams = new URLSearchParams();
	if (params.q) {
		queryParams.set('q', params.q);
	}
	if (params.sort) {
		queryParams.set('sort', params.sort);
	}
	if (params.pagelen) {
		queryParams.set('pagelen', params.pagelen.toString());
	}
	if (params.page) {
		queryParams.set('page', params.page.toString());
	}

	const queryString = queryParams.toString()
		? `?${queryParams.toString()}`
		: '';
	const path = `${API_PATH}/repositories/${params.workspace}/${params.repo_slug}/refs/branches${queryString}`;

	methodLogger.debug(`Sending branches request to: ${path}`);
	try {
		const rawData = await fetchAtlassian(credentials, path);
		// Validate response with Zod schema
		try {
			const validatedData = BranchesResponseSchema.parse(rawData);
			return validatedData;
		} catch (error) {
			if (error instanceof z.ZodError) {
				methodLogger.error(
					'Invalid response from Bitbucket API:',
					error.format(),
				);
				throw createApiError(
					'Received invalid response format from Bitbucket API',
					500,
					error,
				);
			}
			throw error;
		}
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}
		throw createApiError(
			`Failed to list branches: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

/**
 * Creates or updates a file in a Bitbucket repository.
 *
 * This creates a new commit with the file content. If the file already exists,
 * it will be updated. If the file doesn't exist, it will be created.
 *
 * @param {CreateOrUpdateFileParams} params - Parameters for the request
 * @param {string} params.workspace - The workspace slug or UUID
 * @param {string} params.repo_slug - The repository slug or UUID
 * @param {string} params.file_path - The file path within the repository
 * @param {string} params.content - The file content
 * @param {string} params.message - The commit message
 * @param {string} [params.branch] - The branch name to commit to (defaults to main branch)
 * @param {string} [params.author] - Optional author name for the commit
 * @returns {Promise<FileOperationResponse>} Promise containing the commit information
 * @throws {Error} If parameters are invalid, credentials are missing, or API request fails
 * @example
 * // Create or update a file
 * const commit = await createOrUpdateFile({
 *   workspace: 'my-workspace',
 *   repo_slug: 'my-repo',
 *   file_path: 'README.md',
 *   content: '# My Project\n\nDescription...',
 *   message: 'Update README.md',
 *   branch: 'main'
 * });
 */
async function createOrUpdateFile(
	params: CreateOrUpdateFileParams,
): Promise<FileOperationResponse> {
	const methodLogger = Logger.forContext(
		'services/vendor.atlassian.repositories.service.ts',
		'createOrUpdateFile',
	);
	methodLogger.debug(
		`Creating or updating file ${params.file_path} in ${params.workspace}/${params.repo_slug}`,
	);

	// Validate params with Zod
	try {
		CreateOrUpdateFileParamsSchema.parse(params);
	} catch (error) {
		if (error instanceof z.ZodError) {
			methodLogger.error(
				'Invalid parameters provided to create/update file:',
				error.format(),
			);
			throw createApiError(
				`Invalid parameters: ${error.issues.map((e) => e.message).join(', ')}`,
				400,
				error,
			);
		}
		throw error;
	}

	const credentials = getAtlassianCredentials();
	if (!credentials) {
		throw createAuthMissingError(
			'Atlassian credentials are required for this operation',
		);
	}

	// Get repository details to determine the default branch if not provided
	let branch = params.branch;
	if (!branch) {
		methodLogger.debug(
			`No branch provided, fetching repository details to get default branch`,
		);
		try {
			const repoDetails = await get({
				workspace: params.workspace,
				repo_slug: params.repo_slug,
			});
			if (repoDetails.mainbranch?.name) {
				branch = repoDetails.mainbranch.name;
				methodLogger.debug(`Using repository default branch: ${branch}`);
			} else {
				branch = 'main';
				methodLogger.debug(
					`No default branch found, falling back to: ${branch}`,
				);
			}
		} catch (repoError) {
			methodLogger.warn(
				'Failed to get repository details, using fallback branch',
				repoError,
			);
			branch = 'main';
		}
	}

	const path = `${API_PATH}/repositories/${params.workspace}/${params.repo_slug}/src`;

	// Bitbucket Source API requires multipart/form-data format
	// Format: field name = file path (e.g., "/README.md"), field value = file content
	// We'll create multipart/form-data manually since Node.js FormData may not work with fetch
	// Prepare file path - Bitbucket expects the path to start with / for root files
	const filePath = params.file_path.startsWith('/')
		? params.file_path
		: `/${params.file_path}`;

	// Generate boundary for multipart/form-data
	const boundary = `----WebKitFormBoundary${Date.now()}${Math.random().toString(36).substring(2, 15)}`;

	// Build multipart/form-data body manually
	const parts: string[] = [];

	// Add file content (path as field name, content as value)
	parts.push(`--${boundary}`);
	parts.push(`Content-Disposition: form-data; name="${filePath}"`);
	parts.push('');
	parts.push(params.content);

	// Add message
	parts.push(`--${boundary}`);
	parts.push(`Content-Disposition: form-data; name="message"`);
	parts.push('');
	parts.push(params.message);

	// Add branch
	parts.push(`--${boundary}`);
	parts.push(`Content-Disposition: form-data; name="branch"`);
	parts.push('');
	parts.push(branch);

	// Add author if provided
	if (params.author) {
		parts.push(`--${boundary}`);
		parts.push(`Content-Disposition: form-data; name="author"`);
		parts.push('');
		parts.push(params.author);
	}

	// Close boundary
	parts.push(`--${boundary}--`);
	const multipartBody = parts.join('\r\n');

	methodLogger.debug(`Sending POST request to: ${path}`, {
		filePath,
		contentLength: params.content.length,
		branch,
		message: params.message,
		bodyLength: multipartBody.length,
	});

	try {
		const rawData = await fetchAtlassian(credentials, path, {
			method: 'POST',
			body: multipartBody,
			headers: {
				'Content-Type': `multipart/form-data; boundary=${boundary}`,
			},
		});

		// Handle empty response (Bitbucket Source API may return empty body on success)
		if (
			!rawData ||
			(typeof rawData === 'object' && Object.keys(rawData).length === 0)
		) {
			methodLogger.debug(
				'Empty response received, file operation likely succeeded',
			);
			// Return a minimal success response
			// We'll need to get commit info separately or construct a basic response
			return {
				type: 'commit',
				hash: 'unknown', // Will be populated if we can get it
				date: new Date().toISOString(),
				author: {
					type: 'author',
					raw: params.author || 'Unknown',
				},
				message: params.message,
				parents: [],
			};
		}

		// Validate response with Zod schema
		try {
			const validatedData =
				FileOperationResponseSchema.parse(rawData);
			methodLogger.debug(
				'File created/updated successfully:',
				validatedData,
			);
			return validatedData;
		} catch (error) {
			if (error instanceof z.ZodError) {
				methodLogger.warn(
					'Response does not match expected schema, but operation may have succeeded:',
					error.format(),
				);
				methodLogger.debug('Raw response:', rawData);
				// If response is not in expected format but we got a response,
				// assume success and return minimal response
				if (rawData && typeof rawData === 'object') {
					return {
						type: 'commit',
						hash: (rawData as { hash?: string }).hash || 'unknown',
						date:
							(rawData as { date?: string }).date ||
							new Date().toISOString(),
						author:
							(rawData as { author?: FileOperationResponse['author'] })
								.author ||
							{
								type: 'author',
								raw: params.author || 'Unknown',
							},
						message:
							(rawData as { message?: string }).message ||
							params.message,
						parents:
							(rawData as { parents?: FileOperationResponse['parents'] })
								.parents || [],
					};
				}
				// If we can't parse at all, return minimal success
				return {
					type: 'commit',
					hash: 'unknown',
					date: new Date().toISOString(),
					author: {
						type: 'author',
						raw: params.author || 'Unknown',
					},
					message: params.message,
					parents: [],
				};
			}
			throw error;
		}
	} catch (error) {
		if (error instanceof McpError) {
			throw error;
		}
		// More specific error messages for common issues
		if (error instanceof Error && error.message.includes('404')) {
			throw createApiError(
				`Repository not found: ${params.workspace}/${params.repo_slug}`,
				404,
				error,
			);
		}
		if (error instanceof Error && error.message.includes('403')) {
			throw createApiError(
				`Permission denied: You don't have write access to ${params.workspace}/${params.repo_slug}`,
				403,
				error,
			);
		}
		// Handle JSON parsing errors specifically
		if (
			error instanceof Error &&
			error.message.includes('Unexpected end of JSON input')
		) {
			methodLogger.debug(
				'Empty response from Bitbucket API, file operation likely succeeded',
			);
			// Return minimal success response
			return {
				type: 'commit',
				hash: 'unknown',
				date: new Date().toISOString(),
				author: {
					type: 'author',
					raw: params.author || 'Unknown',
				},
				message: params.message,
				parents: [],
			};
		}
		throw createApiError(
			`Failed to create/update file: ${error instanceof Error ? error.message : String(error)}`,
			500,
			error,
		);
	}
}

export default {
	list,
	get,
	listCommits,
	createBranch,
	getFileContent,
	listBranches,
	createOrUpdateFile,
};
