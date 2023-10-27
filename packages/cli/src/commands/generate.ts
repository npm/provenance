import { Args, Command, Flags } from '@oclif/core';
import { createHash } from 'crypto';
import { createReadStream, existsSync } from 'fs';
import { writeFile } from 'fs/promises';
import { parse } from 'path';
import debug from 'debug';
import { generateProvenance } from '@npmcli/generate-provenance';

const DIGEST_ALGORITHM = 'sha256';

type Subject = {
  name: string;
  digest: Record<string, string>;
};

export default class Generate extends Command {
  static override description =
    'Generate SLSA provenance statement on supported cloud CI/CD vendors.';
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
      bug(`Writing provenance statement to ${flags['output-file']}`);
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
