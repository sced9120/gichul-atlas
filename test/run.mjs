// Node에서 브라우저 조립기를 그대로 돌려 보는 테스트.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { buildExamHwpx } from '../site/js/exam-hwpx.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const template = await readFile(join(root, 'site/templates/exam-2col.hwpx'));
const style = JSON.parse(await readFile(join(root, 'site/templates/exam-2col.json'), 'utf8'));
const problems = JSON.parse(await readFile(join(root, 'out/test-data/problems.json'), 'utf8'));

const t0 = performance.now();
const bytes = await buildExamHwpx({
  JSZip, template, style, problems,
  loadImage: p => readFile(join(root, 'out/test-data', p)),
  options: { title: '공통수학2 기출 문항지 (도형의 방정식·집합)' },
});
await mkdir(join(root, 'out'), { recursive: true });
await writeFile(join(root, 'out/exam.hwpx'), bytes);
console.log(`exam.hwpx ${bytes.length} bytes, ${(performance.now() - t0).toFixed(0)} ms`);
