# GLSL Validation from Node.js / TypeScript

**Date:** 2026-08-13
**Goal:** Validate GLSL ES 1.0 fragment shaders (#version 100) from a Node.js/TypeScript process.

---

## 1. `glslang-validator-prebuilt` (npm binary wrapper) ★ RECOMMENDED

**Works in Node.js:** Yes — provides a path to a native binary; invoke via `child_process.execFile()`.

**Installation:**
```
npm install glslang-validator-prebuilt
```

**Usage:**
```js
const validator = require('glslang-validator-prebuilt');
const { execFile } = require('child_process');
// Write shader source to a temp file, then:
execFile(validator.path, ['shader.frag'], (err, stdout, stderr) => {
  // err === null  → valid
  // err !== null  → validation errors in stderr
});
```

**GLSL ES 1.0 support:** Yes. The Khronos `glslangValidator` [supports ESSL #version 100](https://khronos.org/opengles/sdk/tools/Reference-Compiler/) ("Complete for compile-time validation of OpenGL ES 2.0 (ESSL #version 100)").

**License:** [MIT](https://github.com/fand/glslang-validator-prebuilt/blob/master/LICENSE) (the wrapper); the bundled `glslangValidator` binary is [Apache-2.0 with exceptions](https://github.com/KhronosGroup/glslang).

**Platforms:** macOS, Linux, Windows. Binaries downloaded from [KhronosGroup/glslang releases](https://github.com/KhronosGroup/glslang/releases).

**Caveats:**
- Shells out to a native binary (not pure JS/WASM).
- Binary is ~5-10 MB.
- Requires writing shader to a temp file (or can pipe stdin).

**Source:** [github.com/fand/glslang-validator-prebuilt](https://github.com/fand/glslang-validator-prebuilt) — "This package installs the binary of glslangValidator to your node_modules. All binaries are downloaded from https://github.com/KhronosGroup/glslang/releases."

---

## 2. `@webgpu/glslang` (WASM glslang port)

**Works in Node.js:** Yes — includes a `dist/node-devel/` build for Node with non-async startup.

**Installation:**
```
npm install @webgpu/glslang
```

**Usage:**
```js
const glslangModule = require('@webgpu/glslang');
const glslang = await glslangModule();
const stage = glslang.EShLangFragment;
const spirv = glslang.compileGLSL(source, stage, false);
// If compileGLSL succeeds → valid shader
// If it throws → invalid (with error message in exception)
```

**GLSL ES 1.0 support:** Yes — it is a WebAssembly build of the same Khronos glslang. The `compileGLSL` function compiles GLSL to SPIR-V; errors are thrown on invalid GLSL.

**License:** "glslang/LICENSE.txt" — the upstream glslang license (Apache-2.0 with exceptions).

**Last publish:** 6 years ago (v0.0.15). 12 dependents, 43,675 weekly downloads.

**Caveats:**
- Requires WebAssembly runtime (built into Node.js since ~v12).
- WASM binary is ~922 KB (node-devel build).
- `compileGLSL()` is designed for GLSL→SPIR-V compilation; validation is a side effect. There's no "just validate" API.
- Unmaintained? Last release 2019.

**Source:** [npmjs.com/package/@webgpu/glslang](https://www.npmjs.com/package/@webgpu/glslang) — "This is a GLSL-to-SPIR-V compiler for the Web and Node. It is a WebAssembly build of glslang."

---

## 3. `glslangValidator` CLI via Homebrew

**Works in Node.js:** Yes — via `child_process` shelling out to system binary.

**Installation:**
```
brew install glslang
```

**Usage:**
```js
const { execFile } = require('child_process');
execFile('glslangValidator', ['shader.frag'], (err, stdout, stderr) => {
  // null exit code → valid
});
```

**GLSL ES 1.0 support:** Yes — same Khronos tool as option #1.

**License:** Apache-2.0 with exceptions ([KhronosGroup/glslang](https://github.com/KhronosGroup/glslang)).

**Caveats:**
- Requires manual `brew install` — not part of npm install.
- No version pinning via package.json.
- Not available on Windows (without WSL).
- Still requires shelling out to a native binary.

**Source:** [formulae.brew.sh/formula/glslang](https://formulae.brew.sh/formula/glslang) — "OpenGL and OpenGL ES reference compiler for shading languages."

---

## 4. `@shaderfrog/glsl-parser` (Pure JS parser)

**Works in Node.js:** Yes — pure JavaScript/TypeScript, no WASM or native deps.

**Installation:**
```
npm install @shaderfrog/glsl-parser
```

**Usage:**
```js
import { parse, GlslSyntaxError } from '@shaderfrog/glsl-parser';
try {
  const program = parse(shaderSource, { stage: 'fragment' });
  // Parsed successfully — shader is syntactically valid
} catch (e) {
  if (e instanceof GlslSyntaxError) {
    console.log(e.message); // Syntax error details
  }
}
```

**GLSL ES 1.0 support:** Yes — explicitly supports ["GLSL 1.00 and 3.00"](https://github.com/ShaderFrog/glsl-parser) (i.e., GLSL ES 1.0 and 3.0).

**License:** [MIT](https://github.com/ShaderFrog/glsl-parser/blob/main/LICENSE).

**Caveats:**
- **Parser only, not a full validator.** It checks syntax but does limited type checking. From the README: "This library does not support full 'semantic analysis' required by the Khronos GLSL specification. For example, some tokens are only valid in GLSL 1.00 vs 3.00, like `texture()` vs `texture2D()`. This parser considers both valid."
- Cannot validate things like: too many uniforms, invalid texture function for the version, linking errors, etc.
- Includes a preprocessor (handles `#define`, `#if`, etc.).
- 137 stars, 13 forks, actively maintained (290 commits).

**Source:** [github.com/ShaderFrog/glsl-parser](https://github.com/ShaderFrog/glsl-parser) — "The Shaderfrog GLSL compiler is an open source GLSL 1.00 and 3.00 parser and preprocessor... This library is definitively the most complete GLSL compiler written in Javascript."

---

## 5. `naga-wasi-cli` (WASI-compiled naga CLI for Node.js)

**Works in Node.js:** Yes — WASI-compiled CLI, requires Node.js 20+.

**Installation:**
```
npm install naga-wasi-cli
```

**Usage (CLI):**
```
npx naga-wasi-cli --input-kind glsl --shader-stage frag shader.frag
```

**GLSL ES 1.0 support:** Yes — `--input-kind glsl` accepts GLSL input. Naga supports GLSL parsing via `naga::front::glsl`.

**License:** MIT OR Apache-2.0.

**Caveats:**
- CLI only — no programmatic API.
- Requires Node.js 20+ for WASI support.
- Naga's GLSL frontend is designed for Vulkan GLSL, not specifically WebGL GLSL ES. May not enforce ES 1.0 constraints.
- 0 dependents — very new/small project.

**Source:** [npmjs.com/package/naga-wasi-cli](https://www.npmjs.com/package/naga-wasi-cli), [github.com/ihasq/naga-wasi-cli](https://github.com/ihasq/naga-wasi-cli) — "High-performance WASI-compiled naga shader compiler for Node.js."

---

## 6. `wasm-naga` (Naga WASM library)

**Works in Node.js:** Yes — WASM build targeting Node.js via `wasm-pack`.

**Installation:**
```
npm install wasm-naga
```

**GLSL ES 1.0 support:** Claims GLSL input support via naga's frontend (the README mentions "glsl-in" in the build size list). However, it's a naga frontend for GLSL — same caveat as naga-wasi-cli about GLSL ES targeting.

**License:** MIT OR Apache-2.0.

**Caveats:**
- Last published 5 years ago (v0.3.2).
- 0 dependents, 81 weekly downloads.
- No documentation on API surface for GLSL validation specifically.
- Likely abandoned.

**Source:** [npmjs.com/package/wasm-naga](https://www.npmjs.com/package/wasm-naga), [github.com/pjoe/wasm-naga](https://github.com/pjoe/wasm-naga) — "Using naga shader translater with WebAssembly."

---

## 7. `cross-shader` (glslang + SPIRV-Cross WASM wrapper)

**Works in Node.js:** Yes — WASM binary, requires Node 8+.

**Installation:**
```
npm install cross-shader
```

**Usage:**
```js
import xsdr from 'cross-shader';
xsdr.then(({ compile, ShaderFormat, ShaderStage }) => {
  const output = compile(input, { format: ShaderFormat.GLSL, stage: ShaderStage.Fragment, es: true, glslVersion: 100 },
                              { format: ShaderFormat.GLSL, es: true, glslVersion: 100 });
  // Throws on invalid GLSL
});
```

**GLSL ES 1.0 support:** Yes — wraps glslang for input parsing, so inherits its GLSL ES support.

**License:** MIT or Apache-2.0.

**Caveats:**
- Last published 8 years ago (v0.2.3).
- 0 dependents.
- Designed for cross-compilation, not just validation; the compile function is the validation mechanism.
- Likely unmaintained.

**Source:** [npmjs.com/package/cross-shader](https://www.npmjs.com/package/cross-shader), [github.com/alaingalvan/crossshader](https://github.com/alaingalvan/crossshader) — "A cross compiler for shader languages."

---

## 8. `glsl-parser` (stackgl — AST builder)

**Works in Node.js:** Yes — pure JS stream/sync parser.

**Installation:**
```
npm install glsl-parser
```

**Usage:**
```js
const TokenString = require('glsl-tokenizer/string');
const ParseTokens = require('glsl-parser/direct');
const tokens = TokenString(source);
const ast = ParseTokens(tokens);
// If no error → valid syntax; does NOT validate semantics
```

**GLSL ES 1.0 support:** It's a generic GLSL tokenizer/parser. No version-specific validation.

**License:** MIT.

**Caveats:**
- **No semantic validation at all** — just builds an AST.
- Known issues with macros and some expression/declaration ambiguities.
- No type checking.
- 7.4K weekly downloads — widely used as a building block, not a validator.

**Source:** [npmjs.com/package/glsl-parser](https://www.npmjs.com/package/glsl-parser), [github.com/stackgl/glsl-parser](https://github.com/stackgl/glsl-parser) — "transform streamed glsl tokens into an ast."

---

## 9. Puppeteer / Playwright (WebGL compilation)

**Works in Node.js:** Yes — but requires a full headless browser.

**Installation:**
```
npm install puppeteer
```

**Usage:**
```js
const puppeteer = require('puppeteer');
const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
const result = await page.evaluate((src) => {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl');
  const shader = gl.createShader(gl.FRAGMENT_SHADER);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  return gl.getShaderInfoLog(shader);
}, shaderSource);
```

**GLSL ES 1.0 support:** Yes — WebGL natively supports GLSL ES 1.0.

**License:** Apache-2.0 (Puppeteer).

**Caveats:**
- **Very heavy:** ~300 MB browser download + ~200 MB runtime.
- Requires a GPU or software renderer (SwiftShader is bundled with Puppeteer).
- Slow startup (1-3 seconds for browser launch).
- Most complex to set up in CI.
- Overkill if all you need is shader validation.

**Source:** [pptr.dev](https://pptr.dev) — headless Chrome Node.js API.

---

## 10. `glslang` (Khronos' own WASM build — from source)

**Works in Node.js:** Yes — but you must build it yourself from the KhronosGroup/glslang repo.

**Build:**
```sh
git clone https://github.com/KhronosGroup/glslang.git
cd glslang
emcmake cmake -DCMAKE_BUILD_TYPE=Release -DENABLE_GLSLANG_JS=ON \
    -DENABLE_HLSL=OFF -DENABLE_OPT=OFF ..
make
```

**GLSL ES 1.0 support:** Yes — it is the official reference validator.

**License:** Apache-2.0 with exceptions ([KhronosGroup/glslang](https://github.com/KhronosGroup/glslang)).

**Caveats:**
- Requires Emscripten SDK to build.
- Not packaged on npm by the Khronos group themselves (the `@webgpu/glslang` package is the closest).
- `@webgpu/glslang` is effectively the pre-built version of this.

**Source:** [github.com/KhronosGroup/glslang](https://github.com/KhronosGroup/glslang) — "Building to WASM for the Web and Node... For a standalone JS/WASM library, turn on `-DENABLE_GLSLANG_JS=ON`."

---

## Recommendation

| Rank | Option | Method | Why |
|------|--------|--------|-----|
| **1** | `glslang-validator-prebuilt` | Shell out to native binary | Simplest, most reliable, auto-installs binary, uses Khronos reference validator directly, supports all GLSL versions, 100% spec-compliant |
| **2** | `@webgpu/glslang` | WASM in Node.js | In-process, no temp files, no shelling out. Downside: requires async init, unmaintained since 2019, validation is a side effect of SPIR-V compilation |
| **3** | `@shaderfrog/glsl-parser` | Pure JS | Lightweight, fast, good for quick syntax checking + AST manipulation. Not a full validator — misses semantic errors |
| **4** | `glslangValidator` via brew | Shell out to system binary | Same validator as #1 but requires manual install |
| **5** | Puppeteer/Playwright | Headless WebGL | Most accurate for WebGL compatibility but extremely heavy |

**Avoid:**
- `wasm-naga` — Abandoned (5 years), no docs for validation API, naga's GLSL frontend isn't ES-1.0-specific.
- `naga-wasi-cli` — CLI-only, Node.js 20+ required, naga GLSL frontend targets Vulkan not WebGL.
- `cross-shader` — Abandoned (8 years), designed for cross-compilation not validation.
- `glsl-parser` (stackgl) — AST builder only, no semantic validation.
