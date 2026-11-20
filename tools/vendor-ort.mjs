// Copies the pinned ONNX Runtime Web files into app/vendor/ort/ so the app never loads code
// from anywhere else. Run with: npm run vendor
import { copyFileSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { writePhotoManifest } from './photo-manifest.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'node_modules/onnxruntime-web');
const dist = join(src, 'dist');
const out = join(root, 'app/vendor/ort');
mkdirSync(out, { recursive: true });

const version = JSON.parse(readFileSync(join(src, 'package.json'), 'utf8')).version;
// The "wasm bundle" build has the JavaScript glue built in, so only the .wasm file is loaded separately.
for (const f of ['ort.wasm.bundle.min.mjs', 'ort-wasm-simd-threaded.wasm']) {
  copyFileSync(join(dist, f), join(out, f));
  console.log('copied', f);
}

writeFileSync(join(out, 'LICENSE'), `ONNX Runtime Web ${version}
https://github.com/microsoft/onnxruntime

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`);
console.log('wrote LICENSE for onnxruntime-web', version);
writePhotoManifest(root);
