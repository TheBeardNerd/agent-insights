import { spawn } from 'node:child_process';

export async function openReport(reportFile, spawnProcess = spawn) {
  const command = process.platform === 'darwin'
    ? 'open'
    : process.platform === 'win32'
      ? 'cmd'
      : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', reportFile] : [reportFile];

  try {
    const child = spawnProcess(command, args, { detached: true, stdio: 'ignore' });

    return await new Promise((resolve) => {
      const cleanup = () => {
        child.off('error', onError);
        child.off('spawn', onSpawn);
      };
      const onError = () => {
        cleanup();
        resolve(false);
      };
      const onSpawn = () => {
        cleanup();
        child.unref();
        resolve(true);
      };

      child.on('error', onError);
      child.on('spawn', onSpawn);
    });
  } catch {
    return false;
  }
}
