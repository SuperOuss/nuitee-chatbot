import bot from './assets/bot.svg';
import user from './assets/user.svg';

const form = document.querySelector('form');
const chatContainer = document.querySelector('#chat-container');

let loadInterval;


//# FUNCTIONS

// to show "..." while loading message from bot
const loader = (element) => {
  element.textContent = '';

  loadInterval = setInterval(() => {
    element.textContent += '.';

    if (element.textContent.length > 3) {
      element.textContent = '';
    }
  }, 300);
};
//create new session
document.addEventListener('DOMContentLoaded', async function(event) {
  const apiUrl = await window.getApiUrl();
  fetch(`${apiUrl}/regenerate-session`, {
    method: 'GET',
    credentials: 'include'
  })
  .then(res => res.text())
  .then(data => console.log(data))
  .catch(err => console.error('Error:', err));
});

// to generate unique id for each bot message to be able to select it while loading
const generateUniqueID = () => {
  // use date to generate unique id
  const timestamp = new Date().getTime();

  // use random number to generate unique id
  const random = Math.floor(Math.random() * 1000000000);

  // combine both to generate unique id
  return `id-${timestamp}-${random}`;
};

// to show message letter by letter
const typeMessage = (message, element) => {
  const letters = message.split('');
  element.innerHTML = '';

  letters.forEach((letter, index) => {
    setTimeout(() => {
      element.innerHTML += letter === '\n' ? '<br>' : letter;
    }, 50 * index);
  });
};

// to show chat message by user or bot
const chatMessage = (isBot, msg, uniqueId) => {
  return `
    <article class="wrapper ${isBot && 'bot'}">
      <div class="chat">
        <div class="profile">
          <img src="${isBot ? bot : user}" alt="${isBot ? bot : user}" />
        </div>

        <div class="message" id="${uniqueId}">
          ${msg}
        </div>
      </div>
    </article>
    `;
};

// to handle form submit
const handleSubmit = async (e) => {
  e.preventDefault();

  // get user's text
  const data = new FormData(form);

  // user's text
  chatContainer.innerHTML += chatMessage(false, data.get('prompt'));
  form.reset();

  // bot's text
  const uniqueId = generateUniqueID();
  chatContainer.innerHTML += chatMessage(true, '', uniqueId);
  chatContainer.scrollTop = chatContainer.scrollHeight;

  // show "..." while loading message from bot
  const botMessageContainer = document.querySelector(`#${uniqueId}`);
  loader(botMessageContainer);

  // get bot's response from server
  const apiUrl = await window.getApiUrl();
  const response = await fetch(`${apiUrl}/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt: data.get('prompt') }),
  });
  console.log(data.get('prompt'));

  // remove "..." after loading message from bot
  clearInterval(loadInterval);
  botMessageContainer.textContent = '';

  // show bot's response letter by letter
  if (response.ok) {
    const botResponse = await response.json();
    typeMessage(botResponse.message.trim(), botMessageContainer);
  } else {
    const err = await response.text();
    botMessageContainer.textContent = 'Something went wrong. Please try again.';
    alert(err);
    console.log(err);
  }
};

//# EVENT LISTENERS

form.addEventListener('submit', handleSubmit);
form.addEventListener('keyup', (e) => {
  if (e.keyCode === 13) {
    handleSubmit(e);
  }
});

//Get logs 

// Function to fetch and display console logs
const fetchConsoleLogs = async () => {
  try {
    const apiUrl = await window.getApiUrl();
    const response = await fetch(`${apiUrl}/console-logs`);
    if (response.ok) {
      const logs = await response.json();

      // Clear previous logs
      const consoleContainer = document.getElementById('console-container');
      consoleContainer.innerHTML = '';

      // Display new logs
      logs.forEach((log) => {
        const logElement = document.createElement('p');
        logElement.textContent = log;
        consoleContainer.appendChild(logElement);
      });

      // Scroll to the bottom of the console container
      consoleContainer.scrollTop = consoleContainer.scrollHeight;
    } else {
      console.log('Error fetching console logs:', response.statusText);
    }
  } catch (error) {
    console.log('Error fetching console logs:', error);
  }
};

// Call the fetchConsoleLogs function to initially load logs
fetchConsoleLogs();

// Update console logs every X seconds (e.g., every 5 seconds)
setInterval(fetchConsoleLogs, 5000);
