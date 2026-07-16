/**
 * LLM client seam of the extraction pipeline.
 *
 * The pipeline depends on this interface only, so extraction, parsing and
 * verification are tested with an injected fake — zero network in tests.
 * The Anthropic implementation is the single place that talks to the API;
 * the key comes exclusively from the environment (ANTHROPIC_API_KEY): no
 * key is ever read from a file or committed.
 */
import Anthropic from '@anthropic-ai/sdk';

export interface LLMRequest {
  system: string;
  user: string;
  maxTokens: number;
}

export interface LLMUsage {
  input_tokens: number;
  output_tokens: number;
}

export interface LLMResponse {
  text: string;
  usage: LLMUsage;
}

export interface LLMClient {
  readonly model: string;
  complete(request: LLMRequest): Promise<LLMResponse>;
}

/** Default model — decision on the ticket; override with --model. */
export const DEFAULT_EXTRACTION_MODEL = 'claude-sonnet-5';

/**
 * Creates the real Anthropic-backed client. Fails fast with an actionable
 * message when no key is available — the pipeline never invents LLM output.
 */
export function createAnthropicClient(model: string): LLMClient {
  if (!process.env['ANTHROPIC_API_KEY']) {
    throw new Error(
      'ANTHROPIC_API_KEY is not set. The extraction command needs a real Anthropic API key ' +
        'in the environment (never committed). Use --dry-run to prepare the run without a key.',
    );
  }
  const anthropic = new Anthropic();
  return {
    model,
    async complete({ system, user, maxTokens }) {
      const response = await anthropic.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: user }],
      });
      if (response.stop_reason === 'refusal') {
        throw new Error(`The model refused the extraction request (stop_reason: refusal).`);
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error(
          `The model hit max_tokens (${maxTokens}) before finishing — the JSON answer is ` +
            'truncated. Raise maxTokens or reduce the chunk size.',
        );
      }
      const text = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');
      return {
        text,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
        },
      };
    },
  };
}
