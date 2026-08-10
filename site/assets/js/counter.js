const API_URL = "https://hwbqd27i55.execute-api.us-east-2.amazonaws.com/count";
const counter = document.querySelector("[data-visitor-count]");

if (counter) {
  fetch(API_URL)
    .then((response) => {
      if (!response.ok) throw new Error("Counter request failed");
      return response.json();
    })
    .then((data) => {
      counter.textContent = data.count;
    })
    .catch(() => {
      counter.textContent = "N/A";
    });
}
