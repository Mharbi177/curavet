export interface ConversationMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string; // used for tool responses
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface AIProviderContext {
  messages: ConversationMessage[];
  tools?: any[];
}

export interface AIResponse {
  message: ConversationMessage;
  rawResponse: any;
}

export interface AIProvider {
  generateResponse(ctx: AIProviderContext): Promise<AIResponse>;
}
