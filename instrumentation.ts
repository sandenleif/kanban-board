export async function register() {
  // Only run in the Node.js runtime (not in Edge), and only once per process
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startNetworkScanner } = await import("./lib/network-scanner");
    startNetworkScanner();
  }
}
