let API_URL;
console.log(location.host)

if (location.host === 'localhost:5173') {
  fetch("http://localhost:3000/config", { credentials: 'include' })
  .then((response) => response.json())
  .then((config) => {
    API_URL = config.apiUrl;
    console.log(API_URL);
  })
  .catch((error) => {
    console.error("Error fetching configuration:", error);
  });
}
else  {
fetch("https://chatbot.binga.network/api/config")
  .then((response) => response.json())
  .then((config) => {
    API_URL = config.apiUrl;
  })
  .catch((error) => {
    console.error("Error fetching configuration:", error);
  });
}

function getApiUrl() {
  return new Promise((resolve, reject) => {
    if (API_URL) {
      resolve(API_URL);
    } else {
      // Set a timeout to check for the API_URL periodically
      const interval = setInterval(() => {
        if (API_URL) {
          clearInterval(interval);
          resolve(API_URL);
        }
      }, 100);
    }
  });
}
window.getApiUrl = getApiUrl;