export async function withMinDelay(task, minMs = 450) {
  const startedAt = Date.now();
  const result = await task;
  const elapsed = Date.now() - startedAt;
  if (elapsed < minMs) {
    await new Promise((resolve) => setTimeout(resolve, minMs - elapsed));
  }
  return result;
}
