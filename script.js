const topicContainer = document.getElementById("topic-container");
const topicInput = document.getElementById("topic-input");
const taskInput = document.getElementById("task-input");

function createTopic(topicName) {
  let topicDiv = document.createElement("div");
  topicDiv.classList.add("topic");

  topicDiv.innerHTML = `
    <h3>${topicName}</h3>
    <div class="progress-container">
      <div class="progress-bar"></div>
    </div>
    <ul class="task-list"></ul>
  `;
  topicContainer.appendChild(topicDiv);
  saveData();
}

function addTask() {
  let topicName = topicInput.value.trim();
  let taskText = taskInput.value.trim();

  if (!topicName || !taskText) {
    alert("Enter both topic and task!");
    return;
  }

  let topicDiv = [...document.querySelectorAll(".topic")].find(
    (t) => t.querySelector("h3").innerText === topicName
  );

  if (!topicDiv) {
    createTopic(topicName);
    topicDiv = [...document.querySelectorAll(".topic")].find(
      (t) => t.querySelector("h3").innerText === topicName
    );
  }

  const taskList = topicDiv.querySelector(".task-list");
  let li = document.createElement("li");
  li.innerHTML = `${taskText} <span class="close-icon">\u00d7</span>`;
  taskList.appendChild(li);

  topicInput.value = "";
  taskInput.value = "";
  updateProgress(topicDiv);
  saveData();
}

topicContainer.addEventListener("click", (e) => {
  if (e.target.tagName === "LI") {
    e.target.classList.toggle("checked");
    updateProgress(e.target.closest(".topic"));
  } else if (e.target.classList.contains("close-icon")) {
    let topicDiv = e.target.closest(".topic");
    e.target.parentElement.remove();
    updateProgress(topicDiv);
  }
  saveData();
});

function updateProgress(topicDiv) {
  const tasks = topicDiv.querySelectorAll("li");
  const completed = topicDiv.querySelectorAll("li.checked");
  const progressBar = topicDiv.querySelector(".progress-bar");

  let percent =
    tasks.length === 0 ? 0 : Math.round((completed.length / tasks.length) * 100);

  progressBar.style.width = percent + "%";

  if (tasks.length === 0) {
    topicDiv.remove();
  }

  saveData();
}

function saveData() {
  localStorage.setItem("topics", topicContainer.innerHTML);
}

function getData() {
  topicContainer.innerHTML = localStorage.getItem("topics") || "";
}
getData();
