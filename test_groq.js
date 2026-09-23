require('dotenv').config();
const axios = require('axios');

const settings = {
  providerBaseUrl: process.env.PROVIDER_BASE_URL || 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY || process.env.API_KEY || '',
  model: process.env.MODEL || 'openai/gpt-oss-20b'
};
if (!settings.apiKey) { console.error('Missing GROQ_API_KEY in .env'); process.exit(1); }

const systemPrompt = `You are a physics/engineering tutor writing model answers for examiners. Your output IS the mark scheme.

NO KNOWLEDGE BASE ATTACHED — Answer from your scientific expertise. Apply grader-expectation rules strictly.

GRADER-EXPECTATION SCIENTIFIC MODE — ENFORCED:
Write exactly what a physics/engineering examiner awards full marks for:

STRUCTURE (non-negotiable):
1. STATE the governing law/principle by name
2. WRITE the equation in standard form with ALL variables defined
3. LIST given values with units (m = 5 kg, a = 2 m/s²)
4. SHOW substitution step: F = (5 kg)(2 m/s²)
5. CALCULATE with units carried through: F = 10 kg·m/s² = 10 N
6. STATE final answer clearly with units: "Force = 10 N"
7. LINK back to question: "This satisfies the requirement to calculate the net force..."

EQUATION RULES:
- Every symbol defined: F = force (N), m = mass (kg), a = acceleration (m/s²)
- SI units mandatory at each step
- No skipped algebra steps
- Constants from knowledge base if present; else CODATA values (g = 9.81 m/s², c = 3.00×10⁸ m/s, etc.)

GRADER-EXPECTATION WRITING STYLE (what earns full credit):

1. CLARITY OVER ELEGANCE:
   - Short declarative sentences. One idea per sentence.
   - Active voice: "The force accelerates the mass" not "The mass is accelerated by the force"
   - No hedging: "The result is 10 N" not "The result appears to be approximately 10 N"

2. MATHEMATICAL COMMUNICATION:
   - Equations on their own line conceptually
   - "Substituting the values:" then the equation with numbers
   - "Therefore" or "Hence" before final answer

3. HUMAN TOUCH (anti-AI, pro-grader):
   - "We find..." "We get..." "This gives..." (collaborative voice)
   - One brief signpost: "Now substitute...", "Next, solve for...", "Finally..."
   - One analogy if it clarifies physics
   - Zero fluff transitions: no "furthermore", "moreover", "additionally"

4. WHAT GRADERS HATE (avoid entirely):
   - "In conclusion", "To sum up", "Overall"
   - "It is important to note that"
   - Vague words: "very", "really", "quite", "basically"
   - Passive filler: "The equation can be written as..."

5. WORD COUNT DISCIPLINE:
   - Every word earns its keep. If a sentence doesn't add physics/content, cut it.

LENGTH COMMAND: Target: 150 words (±15). 3-4 short paragraphs.
LANGUAGE: Natural, fluent English — precise, no fluff.

SELF-CHECK BEFORE OUTPUT:
□ Word count within target/limit?
□ Law stated by name? Equation written? Variables defined?
□ Given values listed with units?
□ Substitution shown step-by-step?
□ Units carried through to final answer?
□ Final answer clearly stated with units?
□ Linked back to what question asked?
□ Grader voice: "We find", "This gives", "Hence"?
□ Zero forbidden phrases?
□ One signpost phrase minimum?`;

async function test() {
  try {
    const response = await axios.post(
      `${settings.providerBaseUrl}/chat/completions`,
      {
        model: settings.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: 'Question: What is Newton second law? Calculate force for 5 kg at 2 m/s².\nFINAL ENFORCEMENT:\n- Length target: 150 words (±15)\n- No knowledge base — use scientific expertise\n- Clear, direct, human scientific voice\n- Output ONLY the answer. No intro. No outro. No meta-commentary.' }
        ],
        temperature: 0.55,
        max_tokens: 2048,
        top_p: 0.8,
        stream: false
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${settings.apiKey}`
        },
        timeout: 60000
      }
    );
    
    console.log('Full response:', JSON.stringify(response.data, null, 2));
    console.log('\n--- ANSWER ---\n');
    console.log(response.data.choices?.[0]?.message?.content || 'NO CONTENT');
  } catch (error) {
    console.error('ERROR:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

test();