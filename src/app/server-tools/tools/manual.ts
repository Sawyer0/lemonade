export const CONSULT_MANUAL_TOOL = {
    functionDeclarations: [{
        name: "consult_manual",
        description: "Ask the senior mechanic about specific specs, diagrams, or manual details found in the uploaded documents. Use this when the user asks for specific data like torque specs, wiring diagrams, or fluid capacities.",
        parameters: {
            type: "OBJECT",
            properties: {
                question: {
                    type: "STRING",
                    description: "The specific technical question to ask the manual (e.g. 'What is the torque spec for the head bolts?')"
                }
            },
            required: ["question"]
        }
    }]
};

