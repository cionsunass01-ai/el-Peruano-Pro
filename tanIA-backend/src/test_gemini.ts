

async function test() {
    try {
        console.log("Testing Gemini...");
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${process.env.GEMINI_MODEL}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Devuelve unicamente la palabra OK" }] }] })
        });
        const json = await res.json();
        console.log("PASS - Gemini response:", json.candidates[0].content.parts[0].text);
    } catch(e: any) {
        console.error("FAIL", e.message);
        process.exit(1);
    }
}
test();
