import google.generativeai as genai

# Replace with your actual Gemini API key
genai.configure(api_key="AQ.Ab8RN6LR2o6T-b87KGggMgDtKaXbtzyCoNVIDcr0ShOhat6QOw")

print("Fetching available models...\n")

# Loop through all models available to your API key
for model in genai.list_models():
    # We only care about models that can generate text/content
    if "generateContent" in model.supported_generation_methods:
        print(f"Model Name: {model.name}")