export class JsonRpcClient {
  #id = 0;

  constructor({ url, fetchImpl = fetch, timeoutMs = 8_000 }) {
    this.url = url;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async call(method, params = []) {
    const response = await this.fetchImpl(this.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++this.#id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`RPC ${method} failed with HTTP ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(`RPC ${method}: ${payload.error.message ?? "unknown error"}`);
    return payload.result;
  }

  async blockNumber() {
    return Number(BigInt(await this.call("eth_blockNumber")));
  }

  getLogs(filter) {
    return this.call("eth_getLogs", [filter]);
  }

  getBlock(blockNumber) {
    return this.call("eth_getBlockByNumber", [`0x${blockNumber.toString(16)}`, false]);
  }

  ethCall(to, data) {
    return this.call("eth_call", [{ to, data }, "latest"]);
  }
}

