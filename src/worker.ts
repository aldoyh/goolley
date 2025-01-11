import { Ai } from '@cloudflare/ai'
import { Hono, Context } from 'hono'

export interface Env {
  AI: any
}

const app = new Hono<{ Bindings: Env }>()

// Existing text generation endpoint
app.get("/", async (c: Context<{ Bindings: Env }>) => {
  const ai = new Ai(c.env.AI)

  const content = c.req.query("query") || 'What is the origin of the phrase Hello, World'

  const messages = [
    { role: 'system', content: 'You are a friendly assistant' },
    { role: 'user', content }
  ];

  const inputs = { messages }

  const res = await ai.run("@cf/mistral/mistral-7b-instruct-v0.1", inputs)

  return c.json(res)
})

// New image generation and enhancement endpoint
interface GenerateImageRequest {
  prompt: string;
}

interface GenerateImageResponse {
  initialImage: any;
  enhancedImage: any;
}

interface ErrorResponse {
  error: string;
  details?: string;
  code?: number;
}

class APIError extends Error {
  status: number;
  details: string;
  
  constructor(message: string, status: number = 500, details: string = '') {
    super(message);
    this.status = status;
    this.details = details;
  }
  
  toResponse(): ErrorResponse {
    return {
      error: this.message,
      details: this.details,
      code: this.status
    };
  }
}

app.post("/generate-image", async (c: Context<{ Bindings: Env }>) => {
  const ai = new Ai(c.env.AI)

  // Parse the JSON payload
  const { prompt }: GenerateImageRequest = await c.req.json()

  if (!prompt) {
    return c.json<ErrorResponse>({ error: "Prompt is required" }, 400)
  }

  try {
    // Generate the initial image
    const initialImage = Array.from(await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: prompt,
      num_steps: 20,
    }))

    // Enhance the image
    const enhancedImage = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: `Enhanced version of: ${prompt}`,
      image: initialImage,
      strength: 0.5,
      num_steps: 30,
    })

    return c.json<GenerateImageResponse>({ initialImage, enhancedImage })

  } catch (error) {
    console.error(error)
    return c.json<ErrorResponse>({ error: "An error occurred" }, 500)
  }
})

/**
 * The Double Whamies
 * Generates a random prompt from a text gen and passes it to an image gen
 * 
 * 
 */
app.post("/double-whamies", async (c: Context<{ Bindings: Env }>) => {
  const ai = new Ai(c.env.AI)

  try {
    // Generate a random text prompt
    const textResponse = await ai.run("@cf/mistral/mistral-7b-instruct-v0.1", {
      messages: [
        { role: 'system', content: 'Generate a creative prompt for an image' }
      ],
    })

    let prompt: string
    if (typeof textResponse === 'string') {
      prompt = textResponse
    } else if (textResponse instanceof ReadableStream) {
      const reader = textResponse.getReader()
      const decoder = new TextDecoder()
      prompt = ''
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        prompt += decoder.decode(value)
      }
    } else {
      prompt = textResponse?.response || ''
    }

    if (!prompt) {
      return c.json<ErrorResponse>({ error: "Failed to generate prompt" }, 500)
    }

    // Generate the initial image based on the prompt
    const initialImage = Array.from(await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: prompt,
      num_steps: 20,
    }))

    // Enhance the image
    const enhancedImage = await ai.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', {
      prompt: `Enhanced version of: ${prompt}`,
      // image: initialImage,
      strength: 0.5,
      num_steps: 30,
    })

    return c.json<GenerateImageResponse>({ initialImage, enhancedImage })

  } catch (error) {
    console.error(error)
    return c.json<ErrorResponse>({ error: "An error occurred" }, 500)
  }
})

export default app
