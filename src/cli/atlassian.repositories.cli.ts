import { Command } from 'commander';
import { Logger } from '../utils/logger.util.js';
import { handleCliError } from '../utils/error.util.js';
// Import directly from specialized controllers
import { handleRepositoriesList } from '../controllers/atlassian.repositories.list.controller.js';
import { handleRepositoryDetails } from '../controllers/atlassian.repositories.details.controller.js';
import { handleCommitHistory } from '../controllers/atlassian.repositories.commit.controller.js';
import {
	handleCreateBranch,
	handleListBranches,
} from '../controllers/atlassian.repositories.branch.controller.js';
import {
	handleCloneRepository,
	handleGetFileContent,
} from '../controllers/atlassian.repositories.content.controller.js';
import { handleCreateOrUpdateFile } from '../controllers/atlassian.repositories.file.controller.js';

/**
 * CLI module for managing Bitbucket repositories.
 * Provides commands for listing repositories and retrieving repository details.
 * All commands require valid Atlassian credentials.
 */

// Create a contextualized logger for this file
const cliLogger = Logger.forContext('cli/atlassian.repositories.cli.ts');

// Log CLI initialization
cliLogger.debug('Bitbucket repositories CLI module initialized');

/**
 * Register Bitbucket repositories CLI commands with the Commander program
 *
 * @param program - The Commander program instance to register commands with
 * @throws Error if command registration fails
 */
function register(program: Command): void {
	const methodLogger = Logger.forContext(
		'cli/atlassian.repositories.cli.ts',
		'register',
	);
	methodLogger.debug('Registering Bitbucket Repositories CLI commands...');

	registerListRepositoriesCommand(program);
	registerGetRepositoryCommand(program);
	registerGetCommitHistoryCommand(program);
	registerAddBranchCommand(program);
	registerCloneRepositoryCommand(program);
	registerGetFileCommand(program);
	registerListBranchesCommand(program);
	registerCreateOrUpdateFileCommand(program);

	methodLogger.debug('CLI commands registered successfully');
}

/**
 * Register the command for listing Bitbucket repositories in a workspace
 *
 * @param program - The Commander program instance
 */
function registerListRepositoriesCommand(program: Command): void {
	program
		.command('ls-repos')
		.description(
			'List repositories in a Bitbucket workspace, with filtering and pagination.',
		)
		.option(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repositories. If not provided, uses your default workspace (configured via BITBUCKET_DEFAULT_WORKSPACE or first workspace in your account). Example: "myteam"',
		)
		.option(
			'-q, --query <string>',
			'Filter repositories by this query string. Searches repository name and description.',
		)
		.option(
			'-p, --project-key <key>',
			'Filter repositories belonging to the specified project key. Example: "PROJ"',
		)
		.option(
			'-r, --role <string>',
			'Filter repositories where the authenticated user has the specified role or higher. Valid roles: `owner`, `admin`, `contributor`, `member`. Note: `member` typically includes all accessible repositories.',
		)
		.option(
			'-s, --sort <string>',
			'Sort repositories by this field. Examples: "name", "-updated_on" (default), "size".',
		)
		.option(
			'-l, --limit <number>',
			'Maximum number of items to return (1-100). Defaults to 25 if omitted.',
		)
		.option(
			'-c, --cursor <string>',
			'Pagination cursor for retrieving the next set of results.',
		)
		.action(async (options) => {
			const actionLogger = cliLogger.forMethod('ls-repos');
			try {
				actionLogger.debug('CLI ls-repos called', options);

				// Map CLI options to controller options - keep only type conversions
				const controllerOptions = {
					workspaceSlug: options.workspaceSlug,
					query: options.query,
					projectKey: options.projectKey,
					role: options.role,
					sort: options.sort,
					limit: options.limit
						? parseInt(options.limit, 10)
						: undefined,
					cursor: options.cursor,
				};

				// Call controller directly
				const result = await handleRepositoriesList(controllerOptions);

				// Output result content
				console.log(result.content);
			} catch (error) {
				handleCliError(error);
			}
		});
}

/**
 * Register the command for retrieving a specific Bitbucket repository
 * @param program - The Commander program instance
 */
function registerGetRepositoryCommand(program: Command): void {
	program
		.command('get-repo')
		.description(
			'Get detailed information about a specific Bitbucket repository.',
		)
		.option(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository. If not provided, uses your default workspace (either configured via BITBUCKET_DEFAULT_WORKSPACE or first workspace in your account). Example: "myteam"',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug to retrieve. Must be a valid repository in the workspace. Example: "project-api"',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'get-repo',
			);
			try {
				actionLogger.debug(
					`Fetching repository: ${options.workspaceSlug}/${options.repoSlug}`,
				);

				const result = await handleRepositoryDetails({
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
				});

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Operation failed:', error);
				handleCliError(error);
			}
		});
}

/**
 * Register the command for retrieving commit history from a repository
 * @param program - The Commander program instance
 */
function registerGetCommitHistoryCommand(program: Command): void {
	program
		.command('get-commit-history')
		.description('Get commit history for a Bitbucket repository.')
		.option(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository. If not provided, uses your default workspace. Example: "myteam"',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug to get commit history from. Example: "project-api"',
		)
		.option(
			'-v, --revision <branch-or-tag>',
			'Filter commits by a specific branch, tag, or commit hash.',
		)
		.option(
			'--path <file-path>',
			'Filter commits to those that affect this specific file path.',
		)
		.option(
			'-l, --limit <number>',
			'Maximum number of commits to return (1-100). Defaults to 25 if omitted.',
		)
		.option(
			'-c, --cursor <string>',
			'Pagination cursor for retrieving the next set of results.',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'get-commit-history',
			);
			try {
				actionLogger.debug('Processing command options:', options);

				// Map CLI options to controller params - keep only type conversions
				const requestOptions = {
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
					revision: options.revision,
					path: options.path,
					limit: options.limit
						? parseInt(options.limit, 10)
						: undefined,
					cursor: options.cursor,
				};

				actionLogger.debug(
					'Fetching commit history with options:',
					requestOptions,
				);
				const result = await handleCommitHistory(requestOptions);
				actionLogger.debug('Successfully retrieved commit history');

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Operation failed:', error);
				handleCliError(error);
			}
		});
}

/**
 * Register the command for adding a branch to a repository
 * @param program - The Commander program instance
 */
function registerAddBranchCommand(program: Command): void {
	program
		.command('add-branch')
		.description('Add a new branch in a Bitbucket repository.')
		.requiredOption(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository.',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug where the branch will be created.',
		)
		.requiredOption(
			'-n, --new-branch-name <n>',
			'The name for the new branch.',
		)
		.requiredOption(
			'-s, --source-branch-or-commit <target>',
			'The name of the existing branch or a full commit hash to branch from.',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'add-branch',
			);
			try {
				actionLogger.debug('Processing command options:', options);

				// Map CLI options to controller params
				const requestOptions = {
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
					newBranchName: options.newBranchName,
					sourceBranchOrCommit: options.sourceBranchOrCommit,
				};

				actionLogger.debug(
					'Creating branch with options:',
					requestOptions,
				);
				const result = await handleCreateBranch(requestOptions);
				actionLogger.debug('Successfully created branch');

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Operation failed:', error);
				handleCliError(error);
			}
		});
}

/**
 * Register the command for cloning a Bitbucket repository.
 *
 * @param program - The Commander program instance
 */
function registerCloneRepositoryCommand(program: Command): void {
	program
		.command('clone')
		.description(
			'Clone a Bitbucket repository to your local filesystem using SSH (preferred) or HTTPS. ' +
				'The repository will be cloned into a subdirectory at targetPath/repoSlug. ' +
				'Requires Bitbucket credentials and proper SSH key setup for optimal usage.',
		)
		.requiredOption(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository. Example: "myteam"',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug to clone. Example: "project-api"',
		)
		.requiredOption(
			'-t, --target-path <path>',
			'Directory path where the repository will be cloned. Absolute paths are strongly recommended. Example: "/home/user/projects"',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'clone',
			);
			try {
				actionLogger.debug(
					'Processing clone command options:',
					options,
				);

				// Map CLI options to controller params (already correct case)
				const controllerOptions = {
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
					targetPath: options.targetPath,
				};

				actionLogger.debug(
					'Initiating repository clone with options:',
					controllerOptions,
				);
				const result = await handleCloneRepository(controllerOptions);
				actionLogger.info('Clone operation initiated successfully.');

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Clone operation failed:', error);
				handleCliError(error);
			}
		});
}

/**
 * Register the command for getting a file from a Bitbucket repository
 *
 * @param program - The Commander program instance
 */
function registerGetFileCommand(program: Command): void {
	program
		.command('get-file')
		.description('Get the content of a file from a Bitbucket repository.')
		.requiredOption(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository. Must be a valid workspace slug from your Bitbucket account. Example: "myteam"',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug to get the file from. Must be a valid repository slug in the specified workspace. Example: "project-api"',
		)
		.requiredOption(
			'-f, --file-path <path>',
			'Path to the file in the repository. Example: "README.md" or "src/main.js"',
		)
		.option(
			'-v, --revision <branch-tag-or-commit>',
			'Branch name, tag, or commit hash to retrieve the file from. If omitted, the default branch is used.',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'get-file',
			);
			try {
				actionLogger.debug(
					`Fetching file: ${options.workspaceSlug}/${options.repoSlug}/${options.filePath}`,
					options.revision ? { revision: options.revision } : {},
				);

				const result = await handleGetFileContent({
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
					path: options.filePath,
					ref: options.revision,
				});

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Operation failed:', error);
				handleCliError(error);
			}
		});
}

/**
 * Register the command for listing branches in a repository
 * @param program - The Commander program instance
 */
function registerListBranchesCommand(program: Command): void {
	program
		.command('list-branches')
		.description('List branches in a Bitbucket repository.')
		.option(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository. If not provided, uses your default workspace. Example: "myteam"',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug to list branches from. Example: "project-api"',
		)
		.option(
			'-q, --query <string>',
			'Filter branches by name or other properties (text search).',
		)
		.option(
			'-s, --sort <string>',
			'Sort branches by this field. Examples: "name" (default), "-name", "target.date".',
		)
		.option(
			'-l, --limit <number>',
			'Maximum number of branches to return (1-100). Defaults to 25 if omitted.',
		)
		.option(
			'-c, --cursor <string>',
			'Pagination cursor for retrieving the next set of results.',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'list-branches',
			);
			try {
				actionLogger.debug('Processing command options:', options);

				// Map CLI options to controller params - keep only type conversions
				const params = {
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
					query: options.query,
					sort: options.sort,
					limit: options.limit
						? parseInt(options.limit, 10)
						: undefined,
					cursor: options.cursor,
				};

				actionLogger.debug(
					'Fetching branches with parameters:',
					params,
				);
				const result = await handleListBranches(params);
				actionLogger.debug('Successfully retrieved branches');

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Operation failed:', error);
				handleCliError(error);
			}
		});
}

/**
 * Register the command for creating or updating a file in a repository
 * @param program - The Commander program instance
 */
function registerCreateOrUpdateFileCommand(program: Command): void {
	program
		.command('edit-files')
		.description(
			'Create or update a file in a Bitbucket repository. Creates a new commit with the file content.',
		)
		.option(
			'-w, --workspace-slug <slug>',
			'Workspace slug containing the repository. If not provided, uses your default workspace. Example: "myteam"',
		)
		.requiredOption(
			'-r, --repo-slug <slug>',
			'Repository slug where the file will be created or updated. Example: "project-api"',
		)
		.requiredOption(
			'-f, --file-path <path>',
			'Path to the file within the repository. For new directories, include the full path. Example: "README.md" or "src/main.js"',
		)
		.option(
			'-c, --content <content>',
			"The content of the file. This will create a new file if it doesn't exist, or update the existing file if it does. Required if --content-file is not provided.",
		)
		.requiredOption(
			'-m, --message <message>',
			'Commit message describing the change.',
		)
		.option(
			'-b, --branch <branch>',
			"Branch name to commit the file to. If omitted, uses the repository's default branch.",
		)
		.option(
			'--author <author>',
			'Optional author name for the commit. If omitted, uses the authenticated user.',
		)
		.option(
			'--content-file <file>',
			'Read file content from a file instead of providing it directly via --content. Useful for large files. Required if --content is not provided.',
		)
		.action(async (options) => {
			const actionLogger = Logger.forContext(
				'cli/atlassian.repositories.cli.ts',
				'edit-files',
			);
			try {
				actionLogger.debug('Processing command options:', options);

				// Validate that either content or contentFile is provided
				if (!options.content && !options.contentFile) {
					throw new Error(
						'Either --content or --content-file must be provided',
					);
				}

				// Handle content from file if provided
				let content = options.content;
				if (options.contentFile) {
					const fs = await import('fs/promises');
					content = await fs.readFile(options.contentFile, 'utf-8');
					actionLogger.debug(
						`Read content from file: ${options.contentFile} (${content.length} characters)`,
					);
				}

				if (!content) {
					throw new Error('File content is required');
				}

				// Map CLI options to controller params
				const requestOptions = {
					workspaceSlug: options.workspaceSlug,
					repoSlug: options.repoSlug,
					filePath: options.filePath,
					content: content,
					message: options.message,
					branch: options.branch,
					author: options.author,
				};

				actionLogger.debug(
					'Creating or updating file with options:',
					requestOptions,
				);
				const result = await handleCreateOrUpdateFile(requestOptions);
				actionLogger.debug('Successfully created/updated file');

				console.log(result.content);
			} catch (error) {
				actionLogger.error('Operation failed:', error);
				handleCliError(error);
			}
		});
}

export default { register };
