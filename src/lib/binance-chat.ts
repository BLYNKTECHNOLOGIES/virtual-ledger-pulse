export function extractBinanceChatMessages(result: any): any[] {
  const candidates = [
    result?.data?.data?.list,
    result?.data?.list,
    result?.data?.data?.messages,
    result?.data?.messages,
    result?.data?.data,
    result?.data,
    result?.list,
    result?.messages,
    result,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

export function getBinanceChatGroupId(result: any): string | undefined {
  return result?.data?.data?.groupId || result?.data?.groupId || result?.groupId;
}