import atlassianRepositoriesService from '../services/vendor.atlassian.repositories.service.js';
import { Logger } from '../utils/logger.util.js';
import { handleControllerError } from '../utils/error-handler.util.js';
import { ControllerResponse } from '../types/common.types.js';
import { getDefaultWorkspace } from '../utils/workspace.util.js';
import type { CreateOrUpdateFileToolArgsType } from '../tools/atlassian.repositories.types.js';

// Logger instance for this module
const logger = Logger.forContext(
	'controllers/atlassian.repositories.file.controller.ts',
);

/**
 * Creates or updates a file in a Bitbucket repository
 * @param options Options including repository identifiers, file path, content, and commit message
 * @returns Information about the commit created
 */
export async function handleCreateOrUpdateFile(
	options: CreateOrUpdateFileToolArgsType,
): Promise<ControllerResponse> {
	const methodLogger = logger.forMethod('handleCreateOrUpdateFile');
	methodLogger.debug('Creating or updating file with options:', options);

	try {
		// Handle optional workspaceSlug
		let { workspaceSlug } = options;
		if (!workspaceSlug) {
			methodLogger.debug(
				'No workspace provided, fetching default workspace',
			);
			const defaultWorkspace = await getDefaultWorkspace();
			if (!defaultWorkspace) {
				throw new Error(
					'No default workspace found. Please provide a workspace slug.',
				);
			}
			workspaceSlug = defaultWorkspace;
			methodLogger.debug(`Using default workspace: ${defaultWorkspace}`);
		}

		// Required parameters check
		const { repoSlug, filePath, content, message } = options;
		if (!repoSlug) {
			throw new Error('Repository slug is required');
		}
		if (!filePath) {
			throw new Error('File path is required');
		}
		if (content === undefined) {
			throw new Error('File content is required');
		}
		if (!message) {
			throw new Error('Commit message is required');
		}

		// Call service to create or update file
		methodLogger.debug(
			`Creating or updating file ${filePath} in ${workspaceSlug}/${repoSlug}`,
		);
		const commit = await atlassianRepositoriesService.createOrUpdateFile({
			workspace: workspaceSlug,
			repo_slug: repoSlug,
			file_path: filePath,
			content: content,
			message: message,
			branch: options.branch,
			author: options.author,
		});

		// Format success response
		const branchInfo = options.branch
			? ` on branch \`${options.branch}\``
			: '';
		const authorInfo = commit.author.user
			? ` by ${commit.author.user.display_name || commit.author.user.username}`
			: '';

		return {
			content:
				`✅ Successfully ${commit.parents.length > 0 ? 'updated' : 'created'} file \`${filePath}\` in repository \`${workspaceSlug}/${repoSlug}\`${branchInfo}${authorInfo}.\n\n` +
				`**Commit Details:**\n` +
				`- **Commit Hash**: \`${commit.hash}\`\n` +
				`- **Message**: ${commit.message}\n` +
				`- **Date**: ${new Date(commit.date).toLocaleString()}\n` +
				`- **Author**: ${commit.author.raw}\n\n` +
				`**File**: \`${filePath}\`\n` +
				`**Content Length**: ${content.length} characters\n\n` +
				`The file has been committed to the repository.`,
		};
	} catch (error) {
		throw handleControllerError(error, {
			entityType: 'File',
			operation: 'create_or_update',
			source: 'controllers/atlassian.repositories.file.controller.ts@handleCreateOrUpdateFile',
			additionalInfo: options,
		});
	}
}

