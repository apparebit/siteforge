import glob from '@grr/glob';
import tap from 'tap';

const { keys: keysOf } = Object;

tap.test('@grr/glob', t => {
  t.throws(() => glob('b**h**'));

  const PATHS = {
    text: 'file.txt',
    allText: 'filentxt',
    textDir1: 'dir1/file.txt',
    textDir2: 'dir1/dir2/file.txt',
    textDir3: 'dir1/dir2/dir3/file.txt',
    pdf: 'file.pdf',
    pdfDir: 'dir1/file.pdf',
    confusedFile: 'dir1/file.txt/real-file.txt',
    confusedDir: 'dir1/dir2',
    dir1: 'dir1/',
    dir2: 'dir1/dir2/',
    oops: 'dir1/dir2/filé.txt',
  };

  const applyToPaths = pattern => {
    const test = glob(pattern);
    return keysOf(PATHS).reduce((result, key) => {
      result[key] = test(PATHS[key]);
      return result;
    }, {});
  };

  const NOTHING_MATCHES = {
    text: false,
    allText: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: false,
  };

  t.strictSame(applyToPaths(''), NOTHING_MATCHES);
  t.strictSame(applyToPaths('|'), NOTHING_MATCHES);

  t.strictSame(applyToPaths('**'), {
    text: true,
    allText: true,
    textDir1: true,
    textDir2: true,
    textDir3: true,
    pdf: true,
    pdfDir: true,
    confusedFile: true,
    confusedDir: true,
    dir1: true,
    dir2: true,
    oops: true,
  });

  const FILE_DOT_TEXT_GLOB = {
    text: true,
    allText: false,
    textDir1: true,
    textDir2: true,
    textDir3: true,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: false,
  };

  t.strictSame(applyToPaths('file.txt'), FILE_DOT_TEXT_GLOB);
  t.strictSame(applyToPaths('**/file.txt'), FILE_DOT_TEXT_GLOB);
  t.strictSame(applyToPaths('**/**/file.txt'), FILE_DOT_TEXT_GLOB);

  t.strictSame(applyToPaths('dir1/dir2/fil?.txt'), {
    text: false,
    allText: false,
    textDir1: false,
    textDir2: true,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: true,
  });

  t.strictSame(applyToPaths('dir1'), {
    text: false,
    allText: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: true,
    dir2: false,
    oops: false,
  });

  t.strictSame(applyToPaths('dir1/dir2'), {
    text: false,
    allText: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: true,
    dir1: false,
    dir2: true,
    oops: false,
  });

  t.strictSame(applyToPaths('dir1/dir2/'), {
    text: false,
    allText: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: true,
    dir1: false,
    dir2: true,
    oops: false,
  });

  t.strictSame(applyToPaths('dir1/dir2/**'), {
    text: false,
    allText: false,
    textDir1: false,
    textDir2: true,
    textDir3: true,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: true,
    dir1: false,
    dir2: true,
    oops: true,
  });

  t.strictSame(applyToPaths('*file*'), {
    text: true,
    allText: true,
    textDir1: true,
    textDir2: true,
    textDir3: true,
    pdf: true,
    pdfDir: true,
    confusedFile: true,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: false,
  });

  t.ok(glob('/[name]')('/[name]'));
  t.ok(glob('/(name)')('/(name)'));
  t.ok(glob('/{1,}')('/{1,}'));
  t.ok(glob('/one+two')('/one+two'));
  t.end();
});
