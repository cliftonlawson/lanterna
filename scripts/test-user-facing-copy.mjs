import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const ROOTS = ['src/components', 'src/pages'];
const FORBIDDEN = /\b(?:api|backend|bucket|cdn|cloudflare|database|debug|demo|developer|encoding|fake|frontend|infrastructure|locally|master|mock|multipart|object key|placeholder data|playback|provider|r2|sample data|sandbox|sdk|service role|signed url|supabase|test|test data|upload job|webhook)\b/i;
const USER_COPY_PROPERTIES = new Set([
  'cta',
  'desc',
  'description',
  'errorMessage',
  'eyebrow',
  'kicker',
  'label',
  'message',
  'meta',
  'name',
  'placeholder',
  'subtitle',
  'title',
  'updatedAt',
]);
const USER_MESSAGE_CALLS = /^(?:onShowToast|showToast|setAccessError|setCheckoutMessage|setCreateGalleryError|setError|setNotice|setSubmitError)$/;
const USER_ATTRIBUTES = new Set(['alt', 'aria-label', 'placeholder', 'title']);

const files = ROOTS.flatMap(walk).filter((file) => /\.(?:ts|tsx)$/.test(file));
const violations = [];

for (const file of files) {
  const sourceText = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);

  const record = (node, value) => {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (!normalized || !FORBIDDEN.test(normalized)) return;
    const { line, character } = source.getLineAndCharacterOfPosition(node.getStart(source));
    violations.push(`${file}:${line + 1}:${character + 1}  ${JSON.stringify(normalized)}`);
  };

  const recordStrings = (node) => {
    if (ts.isStringLiteralLike(node)) record(node, node.text);
    if (ts.isTemplateExpression(node)) {
      record(node, [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' '));
    }
    ts.forEachChild(node, recordStrings);
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) record(node, node.text);

    if (ts.isJsxExpression(node) && node.expression) recordStrings(node.expression);

    if (ts.isJsxAttribute(node) && USER_ATTRIBUTES.has(node.name.text)) {
      if (node.initializer) recordStrings(node.initializer);
    }

    if (ts.isCallExpression(node)) {
      const callName = ts.isIdentifier(node.expression)
        ? node.expression.text
        : ts.isPropertyAccessExpression(node.expression)
          ? node.expression.name.text
          : '';
      if (USER_MESSAGE_CALLS.test(callName)) node.arguments.forEach(recordStrings);
    }

    if (ts.isPropertyAssignment(node)) {
      const propertyName = ts.isIdentifier(node.name) || ts.isStringLiteral(node.name) ? node.name.text : '';
      if (USER_COPY_PROPERTIES.has(propertyName)) recordStrings(node.initializer);
    }

    if (ts.isReturnStatement(node) && node.expression && ts.isStringLiteralLike(node.expression)) {
      record(node.expression, node.expression.text);
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
}

if (violations.length) {
  console.error('User-facing copy contains test or infrastructure language:\n');
  console.error(violations.join('\n'));
  process.exit(1);
}

console.log(`User-facing copy audit passed (${files.length} files checked).`);

function walk(relativeRoot) {
  const absoluteRoot = path.resolve(relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];

  return fs.readdirSync(absoluteRoot, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(absoluteRoot, entry.name);
    if (entry.isDirectory()) return walk(path.relative(process.cwd(), absolutePath));
    return [path.relative(process.cwd(), absolutePath)];
  });
}
