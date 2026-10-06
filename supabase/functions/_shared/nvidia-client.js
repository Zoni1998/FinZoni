const transient = new Set([429, 500, 502, 503, 504, 529]);
export async function requestNvidia(action, requestData, apiKey, { fetchImpl = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), now = Date.now, budgetMs = 58000 } = {}) {
  const deadline = now() + budgetMs;
  const payload = {
    model: requestData.model || 'meta/llama-3.1-8b-instruct',
    messages: requestData.messages,
    temperature: requestData.temperature ?? 0.7,
    top_p: requestData.top_p ?? 1,
    max_tokens: requestData.max_tokens || 1024,
    stream: false
  };
  // NVIDIA documents GLM-5.3's default as max reasoning. Use low for chat.
  if (/^z-ai\/glm-5\.3(?:$|-)/.test(payload.model)) {
    payload.reasoning_effort = 'low';
    payload.chat_template_kwargs = { clear_thinking: true };
    payload.max_tokens = Math.max(4096, payload.max_tokens);
  }
  if (Array.isArray(requestData.tools) && requestData.tools.length) {
    payload.tools = requestData.tools;
    payload.tool_choice = requestData.tool_choice || 'auto';
  }
  if (requestData.response_format) payload.response_format = requestData.response_format;
  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) return { status: 504, data: { error: 'NVIDIA_TIMEOUT' } };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(30000, remaining));
    let result;
    let retryDelay = 750;
    try {
      const response = await fetchImpl(`https://integrate.api.nvidia.com/v1/${action === 'models' ? 'models' : 'chat/completions'}`, {
        method: action === 'models' ? 'GET' : 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
        ...(action === 'models' ? {} : { body: JSON.stringify(payload) }),
        signal: controller.signal
      });
      // Read the body while the abort timer is still active.
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { error: 'NVIDIA_INVALID_RESPONSE' }; }
      const retryAfter = Number(response.headers.get('retry-after'));
      if (retryAfter > 0) retryDelay = Math.min(2000, retryAfter * 1000);
      result = { status: response.status, data };
      if (response.ok && (!data || typeof data !== 'object' || data.error || (action === 'chat' && !data.choices?.[0]?.message) || (action === 'models' && !Array.isArray(data.data)))) result = { status: 502, data: { error: 'NVIDIA_INVALID_RESPONSE' } };
      if (response.ok && action === 'chat' && data.choices?.[0]?.message) {
        const message = data.choices[0].message;
        if (!message.content?.trim() && !message.tool_calls?.length) result = { status: 502, data: { error: 'NVIDIA_EMPTY_RESPONSE' } };
      }
    } catch (error) {
      result = { status: error?.name === 'AbortError' ? 504 : 502, data: { error: error?.name === 'AbortError' ? 'NVIDIA_TIMEOUT' : 'NVIDIA_CONNECTION_FAILED' } };
    } finally {
      clearTimeout(timer);
    }
    if (attempt === 1 || !transient.has(result.status) || now() + retryDelay + 1000 >= deadline) return result;
    // Retry inference only. No application tool is executed in this endpoint.
    await sleep(retryDelay);
  }
}
