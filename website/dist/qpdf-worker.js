// Runs qpdf (WASM) off the main thread. Each job gets a fresh module so a
// failed run can't leave state behind. Messages: { id, args, input } where
// args use /in.pdf and /out.pdf.
importScripts('./vendor/qpdf/qpdf.js');

// This qpdf build binds console.log/error directly and ignores print options,
// so messages are captured by swapping the console methods during a job.
let log = [];
console.log = (...parts) => log.push(parts.join(' '));
console.error = (...parts) => log.push(parts.join(' '));

self.onmessage = async ({ data: { id, args, input } }) => {
  log = [];
  try {
    const qpdf = await self.Module({ locateFile: () => './vendor/qpdf/qpdf.wasm', noInitialRun: true });
    qpdf.FS.writeFile('/in.pdf', input);
    let code;
    try { code = qpdf.callMain(args); } catch (error) { code = typeof error?.status === 'number' ? error.status : 2; }
    // qpdf exits 0 on success and 3 when it succeeded with warnings.
    if (code !== 0 && code !== 3) { self.postMessage({ id, error: log.join('\n') || 'qpdf failed' }); return; }
    const output = qpdf.FS.readFile('/out.pdf');
    self.postMessage({ id, output, warnings: code === 3 ? log : [] }, [output.buffer]);
  } catch (error) {
    self.postMessage({ id, error: log.join('\n') || String(error?.message || error) });
  }
};
