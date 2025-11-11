const topicInput = document.getElementById("topic-input");
const inputBox = document.getElementById("task-input");
const listContainer = document.getElementById("list-container");
const lockBtn = document.getElementById("lock-btn");

let lockedTopic = null;

function toggleLock() {
  if (!lockedTopic) {
    const topicName = topicInput.value.trim();
    if (!topicName) {
      alert("Enter a topic name to lock.");
      return;
    }
    lockedTopic = topicName;
    topicInput.disabled = true;
    lockBtn.innerText = "🔓";
  } else {
    lockedTopic = null;
    topicInput.disabled = false;
    lockBtn.innerText = "🔒";
  }
}

function addTask() {
  let topicName = lockedTopic || topicInput.value.trim();
  let taskText = inputBox.value.trim();

  if (!topicName || !taskText) {
    alert("Enter both topic and task!");
    return;
  }

  let topicDiv = [...document.querySelectorAll(".topic")].find(
    (t) => t.querySelector("h3").innerText === topicName
  );

  if (!topicDiv) {
    topicDiv = document.createElement("div");
    topicDiv.classList.add("topic");
    topicDiv.innerHTML = `
      <h3>${topicName}</h3>
      <div class="progress-container"><div class="progress-bar"></div></div>
      <ul class="task-list"></ul>
    `;
    listContainer.appendChild(topicDiv);
  }

  const taskList = topicDiv.querySelector(".task-list");
  let li = document.createElement("li");
  li.innerHTML = `${taskText} <span class="close-icon">&#x2716;</span>`;
  taskList.appendChild(li);

  inputBox.value = "";
  updateProgress(topicDiv);
  saveData();
}

listContainer.addEventListener("click", (e) => {
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
  localStorage.setItem("topicData", listContainer.innerHTML);
}

function getData() {
  listContainer.innerHTML = localStorage.getItem("topicData") || "";
}
getData();

inputBox.addEventListener("keypress", function (e) {
  if (e.key === "Enter") addTask();
});
