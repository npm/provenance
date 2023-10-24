import { Args, Command, Flags } from '@oclif/core';
import { createHash } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { parse } from 'path';
import * as ci from 'ci-info';
import debug from 'debug';

const DIGEST_ALGORITHM = 'sha256';

type Subject = {
  name: string;
  digest: Record<string, string>;
};

export default class Generate extends Command {
  static override description =
    'Generate SLSA provenance information on supported cloud CI/CD vendors.';
  static override examples = ['<%= config.bin %> <%= command.id %>'];

  static override flags = {
    'subject-name': Flags.string({
      description: 'Subject name to use in statement',
      required: false,
    }),
    'subject-digest': Flags.string({
      description: 'Subject digest to use in statement',
      required: false,
    }),
    'output-file': Flags.string({
      char: 'o',
      description: 'write output to file',
      required: false,
      aliases: ['output', 'out'],
    }),
  };

  static override args = {
    ['subject-path']: Args.file({
      description: 'subject file to generate statement for',
      required: false,
      exists: true,
    }),
  };

  public async run(): Promise<object> {
    const bug = debug('provenance:generate');
    const { args, flags } = await this.parse(Generate);

    const subject = await subjectFromInputs(args, flags);
    bug(
      `Generating provenance for ${subject.name} with digest ${JSON.stringify(
        subject.digest
      )}`
    );
    const provenance = generateProvenance(subject, process.env);

    if (flags['output-file']) {
      bug(`Writing provenance to ${flags['output-file']}`);
      await writeFile(
        flags['output-file'],
        JSON.stringify(provenance, null, 2)
      );
    } else {
      this.log(JSON.stringify(provenance, null, 2));
    }

    return provenance;
  }
}

const INTOTO_STATEMENT_V01_TYPE = 'https://in-toto.io/Statement/v0.1';
const INTOTO_STATEMENT_V1_TYPE = 'https://in-toto.io/Statement/v1';
const SLSA_PREDICATE_V02_TYPE = 'https://slsa.dev/provenance/v0.2';
const SLSA_PREDICATE_V1_TYPE = 'https://slsa.dev/provenance/v1';

const GITHUB_BUILDER_ID_PREFIX = 'https://github.com/actions/runner';
const GITHUB_BUILD_TYPE =
  'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1';

const GITLAB_BUILD_TYPE_PREFIX = 'https://github.com/npm/cli/gitlab';
const GITLAB_BUILD_TYPE_VERSION = 'v0alpha1';

export const generateProvenance = (
  subject: Subject,
  env: NodeJS.ProcessEnv
): object => {
  let payload;
  if (ci.GITHUB_ACTIONS) {
    /* istanbul ignore next - not covering missing env var case */
    const [workflowPath, workflowRef] = (env.GITHUB_WORKFLOW_REF || '')
      .replace(env.GITHUB_REPOSITORY + '/', '')
      .split('@');
    payload = {
      _type: INTOTO_STATEMENT_V1_TYPE,
      subject,
      predicateType: SLSA_PREDICATE_V1_TYPE,
      predicate: {
        buildDefinition: {
          buildType: GITHUB_BUILD_TYPE,
          externalParameters: {
            workflow: {
              ref: workflowRef,
              repository: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}`,
              path: workflowPath,
            },
          },
          internalParameters: {
            github: {
              event_name: env.GITHUB_EVENT_NAME,
              repository_id: env.GITHUB_REPOSITORY_ID,
              repository_owner_id: env.GITHUB_REPOSITORY_OWNER_ID,
            },
          },
          resolvedDependencies: [
            {
              uri: `git+${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}@${env.GITHUB_REF}`,
              digest: {
                gitCommit: env.GITHUB_SHA,
              },
            },
          ],
        },
        runDetails: {
          builder: {
            id: `${GITHUB_BUILDER_ID_PREFIX}/${env.RUNNER_ENVIRONMENT}`,
          },
          metadata: {
            /* eslint-disable-next-line max-len */
            invocationId: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}/attempts/${env.GITHUB_RUN_ATTEMPT}`,
          },
        },
      },
    };
  } else if (ci.GITLAB) {
    payload = {
      _type: INTOTO_STATEMENT_V01_TYPE,
      subject,
      predicateType: SLSA_PREDICATE_V02_TYPE,
      predicate: {
        buildType: `${GITLAB_BUILD_TYPE_PREFIX}/${GITLAB_BUILD_TYPE_VERSION}`,
        builder: { id: `${env.CI_PROJECT_URL}/-/runners/${env.CI_RUNNER_ID}` },
        invocation: {
          configSource: {
            uri: `git+${env.CI_PROJECT_URL}`,
            digest: {
              sha1: env.CI_COMMIT_SHA,
            },
            entryPoint: env.CI_JOB_NAME,
          },
          parameters: {
            CI: env.CI,
            CI_API_GRAPHQL_URL: env.CI_API_GRAPHQL_URL,
            CI_API_V4_URL: env.CI_API_V4_URL,
            CI_BUILD_BEFORE_SHA: env.CI_BUILD_BEFORE_SHA,
            CI_BUILD_ID: env.CI_BUILD_ID,
            CI_BUILD_NAME: env.CI_BUILD_NAME,
            CI_BUILD_REF: env.CI_BUILD_REF,
            CI_BUILD_REF_NAME: env.CI_BUILD_REF_NAME,
            CI_BUILD_REF_SLUG: env.CI_BUILD_REF_SLUG,
            CI_BUILD_STAGE: env.CI_BUILD_STAGE,
            CI_COMMIT_BEFORE_SHA: env.CI_COMMIT_BEFORE_SHA,
            CI_COMMIT_BRANCH: env.CI_COMMIT_BRANCH,
            CI_COMMIT_REF_NAME: env.CI_COMMIT_REF_NAME,
            CI_COMMIT_REF_PROTECTED: env.CI_COMMIT_REF_PROTECTED,
            CI_COMMIT_REF_SLUG: env.CI_COMMIT_REF_SLUG,
            CI_COMMIT_SHA: env.CI_COMMIT_SHA,
            CI_COMMIT_SHORT_SHA: env.CI_COMMIT_SHORT_SHA,
            CI_COMMIT_TIMESTAMP: env.CI_COMMIT_TIMESTAMP,
            CI_COMMIT_TITLE: env.CI_COMMIT_TITLE,
            CI_CONFIG_PATH: env.CI_CONFIG_PATH,
            CI_DEFAULT_BRANCH: env.CI_DEFAULT_BRANCH,
            CI_DEPENDENCY_PROXY_DIRECT_GROUP_IMAGE_PREFIX:
              env.CI_DEPENDENCY_PROXY_DIRECT_GROUP_IMAGE_PREFIX,
            CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX:
              env.CI_DEPENDENCY_PROXY_GROUP_IMAGE_PREFIX,
            CI_DEPENDENCY_PROXY_SERVER: env.CI_DEPENDENCY_PROXY_SERVER,
            CI_DEPENDENCY_PROXY_USER: env.CI_DEPENDENCY_PROXY_USER,
            CI_JOB_ID: env.CI_JOB_ID,
            CI_JOB_NAME: env.CI_JOB_NAME,
            CI_JOB_NAME_SLUG: env.CI_JOB_NAME_SLUG,
            CI_JOB_STAGE: env.CI_JOB_STAGE,
            CI_JOB_STARTED_AT: env.CI_JOB_STARTED_AT,
            CI_JOB_URL: env.CI_JOB_URL,
            CI_NODE_TOTAL: env.CI_NODE_TOTAL,
            CI_PAGES_DOMAIN: env.CI_PAGES_DOMAIN,
            CI_PAGES_URL: env.CI_PAGES_URL,
            CI_PIPELINE_CREATED_AT: env.CI_PIPELINE_CREATED_AT,
            CI_PIPELINE_ID: env.CI_PIPELINE_ID,
            CI_PIPELINE_IID: env.CI_PIPELINE_IID,
            CI_PIPELINE_SOURCE: env.CI_PIPELINE_SOURCE,
            CI_PIPELINE_URL: env.CI_PIPELINE_URL,
            CI_PROJECT_CLASSIFICATION_LABEL:
              env.CI_PROJECT_CLASSIFICATION_LABEL,
            CI_PROJECT_DESCRIPTION: env.CI_PROJECT_DESCRIPTION,
            CI_PROJECT_ID: env.CI_PROJECT_ID,
            CI_PROJECT_NAME: env.CI_PROJECT_NAME,
            CI_PROJECT_NAMESPACE: env.CI_PROJECT_NAMESPACE,
            CI_PROJECT_NAMESPACE_ID: env.CI_PROJECT_NAMESPACE_ID,
            CI_PROJECT_PATH: env.CI_PROJECT_PATH,
            CI_PROJECT_PATH_SLUG: env.CI_PROJECT_PATH_SLUG,
            CI_PROJECT_REPOSITORY_LANGUAGES:
              env.CI_PROJECT_REPOSITORY_LANGUAGES,
            CI_PROJECT_ROOT_NAMESPACE: env.CI_PROJECT_ROOT_NAMESPACE,
            CI_PROJECT_TITLE: env.CI_PROJECT_TITLE,
            CI_PROJECT_URL: env.CI_PROJECT_URL,
            CI_PROJECT_VISIBILITY: env.CI_PROJECT_VISIBILITY,
            CI_REGISTRY: env.CI_REGISTRY,
            CI_REGISTRY_IMAGE: env.CI_REGISTRY_IMAGE,
            CI_REGISTRY_USER: env.CI_REGISTRY_USER,
            CI_RUNNER_DESCRIPTION: env.CI_RUNNER_DESCRIPTION,
            CI_RUNNER_ID: env.CI_RUNNER_ID,
            CI_RUNNER_TAGS: env.CI_RUNNER_TAGS,
            CI_SERVER_HOST: env.CI_SERVER_HOST,
            CI_SERVER_NAME: env.CI_SERVER_NAME,
            CI_SERVER_PORT: env.CI_SERVER_PORT,
            CI_SERVER_PROTOCOL: env.CI_SERVER_PROTOCOL,
            CI_SERVER_REVISION: env.CI_SERVER_REVISION,
            CI_SERVER_SHELL_SSH_HOST: env.CI_SERVER_SHELL_SSH_HOST,
            CI_SERVER_SHELL_SSH_PORT: env.CI_SERVER_SHELL_SSH_PORT,
            CI_SERVER_URL: env.CI_SERVER_URL,
            CI_SERVER_VERSION: env.CI_SERVER_VERSION,
            CI_SERVER_VERSION_MAJOR: env.CI_SERVER_VERSION_MAJOR,
            CI_SERVER_VERSION_MINOR: env.CI_SERVER_VERSION_MINOR,
            CI_SERVER_VERSION_PATCH: env.CI_SERVER_VERSION_PATCH,
            CI_TEMPLATE_REGISTRY_HOST: env.CI_TEMPLATE_REGISTRY_HOST,
            GITLAB_CI: env.GITLAB_CI,
            GITLAB_FEATURES: env.GITLAB_FEATURES,
            GITLAB_USER_ID: env.GITLAB_USER_ID,
            GITLAB_USER_LOGIN: env.GITLAB_USER_LOGIN,
            RUNNER_GENERATE_ARTIFACTS_METADATA:
              env.RUNNER_GENERATE_ARTIFACTS_METADATA,
          },
          environment: {
            name: env.CI_RUNNER_DESCRIPTION,
            architecture: env.CI_RUNNER_EXECUTABLE_ARCH,
            server: env.CI_SERVER_URL,
            project: env.CI_PROJECT_PATH,
            job: {
              id: env.CI_JOB_ID,
            },
            pipeline: {
              id: env.CI_PIPELINE_ID,
              ref: env.CI_CONFIG_PATH,
            },
          },
        },
        metadata: {
          buildInvocationId: `${env.CI_JOB_URL}`,
          completeness: {
            parameters: true,
            environment: true,
            materials: false,
          },
          reproducible: false,
        },
        materials: [
          {
            uri: `git+${env.CI_PROJECT_URL}`,
            digest: {
              sha1: env.CI_COMMIT_SHA,
            },
          },
        ],
      },
    };
  } else {
    throw new Error(
      `Unsupported CI system: ${ci.name}. Only GitHub Actions and GitLab CI are supported.`
    );
  }
  return payload;
};

type Args = {
  'subject-path': string | undefined;
};

type Flags = {
  'subject-name': string | undefined;
  'subject-digest': string | undefined;
  'output-file': string | undefined;
} & { [flag: string]: string | undefined };

const subjectFromInputs = async (
  args: Args,
  flags: Flags
): Promise<Subject> => {
  if (args['subject-path'] && flags['subject-digest']) {
    throw new Error(
      'Only one of subject-path or subject-digest may be provided'
    );
  }

  if (args['subject-path']) {
    return getSubjectFromPath(args['subject-path'], flags['subject-name']);
  } else {
    if (!flags['subject-digest']) {
      throw new Error('One of subject-path or subject-digest must be provided');
    }
    if (!flags['subject-name']) {
      throw new Error(
        'subject-name must be provided when using subject-digest'
      );
    }

    return getSubjectFromDigest(flags['subject-digest'], flags['subject-name']);
  }
};

// Returns the subject specified by the path to a file. The file's digest is
// calculated and returned along with the subject's name.
const getSubjectFromPath = async (
  subjectPath: string,
  subjectName?: string
): Promise<Subject> => {
  if (!existsSync(subjectPath)) {
    throw new Error(`Could not find subject at path ${subjectPath}`);
  }
  const name = subjectName || parse(subjectPath).base;
  const digest = await digestFile(DIGEST_ALGORITHM, subjectPath);

  return {
    name,
    digest: { [DIGEST_ALGORITHM]: digest },
  };
};

// Returns the subject specified by the digest of a file. The digest is returned
// along with the subject's name.
const getSubjectFromDigest = (
  subjectDigest: string,
  subjectName: string
): Subject => {
  if (!subjectDigest.match(/^sha256:[A-Za-z0-9]{64}$/)) {
    throw new Error(
      'subject-digest must be in the format "sha256:<hex-digest>"'
    );
  }
  const [alg, digest] = subjectDigest.split(':');

  return {
    name: subjectName,
    digest: { [alg]: digest },
  };
};

// Calculates the digest of a file using the specified algorithm. The file is
// streamed into the digest function to avoid loading the entire file into
// memory. The returned digest is a hex string.
const digestFile = async (
  algorithm: string,
  filePath: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const hash = createHash(algorithm).setEncoding('hex');
    createReadStream(filePath)
      .once('error', reject)
      .pipe(hash)
      .once('finish', () => resolve(hash.read()));
  });
};
