// Because the browser and the FastAPI server are both running on your Pop!_OS laptop, 
// we can safely use localhost instead of your Wi-Fi IP here.
const API_URL = "http://127.0.0.1:8000/translate";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "translate") {
    const inputDiv = document.getElementById("inputText");
    const outputDiv = document.getElementById("outputText");

    // Instantly show what was highlighted (forced Left-to-Right for English)
    inputDiv.textContent = request.text;
    inputDiv.dir = "ltr";
    
    // Show a loading state
    outputDiv.innerHTML = "<span class='loading'>Translating via buddy...</span>";
    outputDiv.dir = "ltr";

    // Build the context string from page title + surrounding text
    // This gives the model ~100-150 tokens of disambiguation context
    const context = request.pageContext || "";

    // Call your local FastAPI server
    fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        text: request.text,
        direction: "en-ur", // Hardcoded strictly to English-to-Urdu
        context: context,
        history: [] 
      })
    })
    .then(response => {
      if (!response.ok) throw new Error("API Error");
      return response.json();
    })
    .then(data => {
      // Apply correct RTL text direction for the Urdu output
      outputDiv.dir = "rtl";
      outputDiv.textContent = data.translation;
    })
    .catch(error => {
      outputDiv.dir = "ltr";
      outputDiv.innerHTML = "<span class='error'>Error: Could not connect to API. Is FastAPI running?</span>";
      console.error(error);
    });
  }
});