"use strict";

// === Firebase Initialization ===
// Paste your Firebase configuration snippet below:
const firebaseConfig = {
  apiKey: "AIzaSyACQP-Q1F_TXY7y8Pn6xF7QUZvad_SXttg",
  authDomain: "timeline-a1de7.firebaseapp.com",
  projectId: "timeline-a1de7",
  storageBucket: "timeline-a1de7.firebasestorage.app",
  messagingSenderId: "770112197171",
  appId: "1:770112197171:web:1bc6d4bb1d0fd6d5770946",
  measurementId: "G-63FBE91BEQ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const tasksRef = db.collection("tasks");

// === DOM Elements & Layout Constants ===
const timelineContainer = document.getElementById('timeline-container');
const timeline = document.getElementById('timeline');
const todayButton = document.getElementById('todayButton');
const taskDetailsPanel = document.getElementById('taskDetails');
const detailsTitle = document.getElementById('detailsTitle');
const detailsNotes = document.getElementById('detailsNotes');
const closeDetailsButton = document.getElementById('closeDetails');

// Layout constants
const leftMargin = 150;     // gap before timeline starts
const rightMargin = 50;     // right margin
const daySpacing = 60;      // spacing between each day (tick)
const totalWeeks = 20;      // total weeks to display
const totalDays = totalWeeks * 7;  // total days to display
const arrowY = 100;         // y-coordinate of the timeline arrow

// Fixed first day: January 2, 2023 (a Monday)
const baseDate = new Date(2023, 0, 2);  // Month is 0-indexed

// Set timeline width based on total days
timeline.style.width = (leftMargin + rightMargin + totalDays * daySpacing) + 'px';

// === Generate Day Markers ===
// For each day, add a vertical tick. Only the 7th tick (i % 7 === 6) shows the date.
function addDayMarker(date, index) {
  const xPos = leftMargin + index * daySpacing;
  
  // Create the day marker
  const marker = document.createElement('div');
  marker.className = 'day-marker';
  marker.style.left = xPos + 'px';
  marker.setAttribute('data-date', date.toISOString().split('T')[0]);
  timeline.appendChild(marker);
  
  // Every 7th tick displays the date (e.g., Sunday)
  if (index % 7 === 6) {
    const label = document.createElement('div');
    label.className = 'day-label';
    label.style.left = (xPos - 20) + 'px';
    const options = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };
    label.textContent = date.toLocaleDateString(undefined, options);
    timeline.appendChild(label);
  }
}

for (let i = 0; i < totalDays; i++) {
  let markerDate = new Date(baseDate);
  markerDate.setDate(baseDate.getDate() + i);
  addDayMarker(markerDate, i);
}

// === Add Task by Clicking on Timeline Background ===
// Clicking on the timeline (but not on a marker or task) adds a task for the day corresponding to the click.
timeline.addEventListener('click', function(e) {
  if (e.target !== timeline) return;  // only trigger on clicks on the timeline background
  const timelineRect = timeline.getBoundingClientRect();
  const clickX = e.clientX - timelineRect.left;
  if (clickX < leftMargin) return;  // ignore clicks before the timeline starts
  
  const relativeX = clickX - leftMargin;
  const dayIndex = Math.floor(relativeX / daySpacing);
  
  // Compute the task's date
  let taskDate = new Date(baseDate);
  taskDate.setDate(baseDate.getDate() + dayIndex);
  
  // Compute centered task position for the day:
  const taskWidth = 120;
  const taskLeft = leftMargin + dayIndex * daySpacing + (daySpacing / 2) - (taskWidth / 2);
  const taskTop = arrowY - 60;  // "to do" tasks appear above the arrow
  
  const taskName = prompt("Enter task name:");
  if (!taskName) return;
  
  addTask(taskName, taskLeft, taskTop, taskDate);
});

// === Firebase-Driven Task Rendering ===
let taskElements = {}; // Maps Firestore document IDs to DOM elements

tasksRef.onSnapshot(snapshot => {
  snapshot.docChanges().forEach(change => {
    const doc = change.doc;
    const data = doc.data();
    if (change.type === "added") {
      const taskEl = createTaskElement(doc.id, data);
      timeline.appendChild(taskEl);
      taskElements[doc.id] = taskEl;
    } else if (change.type === "modified") {
      const taskEl = taskElements[doc.id];
      if (taskEl) {
        taskEl.style.left = data.left + "px";
        taskEl.style.top = data.top + "px";
        taskEl.textContent = data.taskName;
        if (data.state === "done") {
          taskEl.classList.remove("todo");
          taskEl.classList.add("done");
        } else {
          taskEl.classList.remove("done");
          taskEl.classList.add("todo");
        }
      }
    } else if (change.type === "removed") {
      const taskEl = taskElements[doc.id];
      if (taskEl) {
        taskEl.remove();
        delete taskElements[doc.id];
      }
    }
  });
});

// Create a DOM element for a task
function createTaskElement(id, data) {
  const task = document.createElement("div");
  task.className = "task " + data.state;
  task.textContent = data.taskName;
  task.style.left = data.left + "px";
  task.style.top = data.top + "px";
  task.setAttribute("data-id", id);
  task.setAttribute("data-date", data.taskDate);

  // Enable dragging
  task.addEventListener("mousedown", taskDragStart);

  // Left-click: open task details (notes)
  task.addEventListener("click", (e) => {
    // Prevent drag clicks from triggering details
    if (draggingTask) return;
    openTaskDetails(id, data);
  });

  // Right-click: toggle task state (and adjust vertical position)
  task.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    toggleTaskState(task);
  });

  return task;
}

// Add a new task to Firestore
function addTask(taskName, left, top, taskDate) {
  const taskDateStr = taskDate.toISOString().split('T')[0];
  tasksRef.add({
    taskName: taskName,
    left: left,
    top: top,
    state: "todo",      // New tasks start as "to do" (grey, above the arrow)
    taskDate: taskDateStr,
    notes: ""
  });
}

// === Drag and Drop Functionality ===
let draggingTask = null, dragOffsetX, dragOffsetY;

function taskDragStart(e) {
  if (e.button !== 0) return; // Only allow left-click dragging
  draggingTask = e.target;
  dragOffsetX = e.offsetX;
  dragOffsetY = e.offsetY;
  document.addEventListener("mousemove", taskDragMove);
  document.addEventListener("mouseup", taskDragEnd);
}

function taskDragMove(e) {
  if (!draggingTask) return;
  const timelineRect = timeline.getBoundingClientRect();
  let newLeft = e.clientX - timelineRect.left - dragOffsetX;
  let newTop = e.clientY - timelineRect.top - dragOffsetY;
  draggingTask.style.left = newLeft + "px";
  draggingTask.style.top = newTop + "px";
}

function taskDragEnd(e) {
  if (!draggingTask) return;
  const newLeft = parseFloat(draggingTask.style.left);
  const newTop = parseFloat(draggingTask.style.top);
  const taskId = draggingTask.getAttribute("data-id");
  // If dropped below the arrow, state becomes "done"; otherwise, "todo"
  let newState = (newTop > arrowY) ? "done" : "todo";
  // Adjust vertical position based on state:
  let adjustedTop = (newState === "done") ? arrowY + 20 : arrowY - 60;
  tasksRef.doc(taskId).update({
    left: newLeft,
    top: adjustedTop,
    state: newState
  });
  draggingTask = null;
  document.removeEventListener("mousemove", taskDragMove);
  document.removeEventListener("mouseup", taskDragEnd);
}

// === Toggle Task State on Right-Click ===
function toggleTaskState(taskEl) {
  const taskId = taskEl.getAttribute("data-id");
  let currentState = taskEl.classList.contains("done") ? "done" : "todo";
  let newState, newTop;
  if (currentState === "todo") {
    newState = "done";
    newTop = arrowY + 20; // move below the timeline
  } else {
    newState = "todo";
    newTop = arrowY - 60; // move above the timeline
  }
  tasksRef.doc(taskId).update({
    state: newState,
    top: newTop
  });
}

// === Task Details Panel Functionality ===
let currentTaskId = null;

function openTaskDetails(taskId, data) {
  currentTaskId = taskId;
  detailsTitle.textContent = data.taskName + " (" + data.taskDate + ")";
  detailsNotes.value = data.notes || "";
  taskDetailsPanel.classList.remove("hidden");
}

// Save notes when the textarea loses focus
detailsNotes.addEventListener("blur", () => {
  if (currentTaskId) {
    tasksRef.doc(currentTaskId).update({
      notes: detailsNotes.value
    });
  }
});

// Close the task details panel
closeDetailsButton.addEventListener("click", () => {
  taskDetailsPanel.classList.add("hidden");
  currentTaskId = null;
});

// === "Today" Button Functionality ===
// Clicking the Today button scrolls back to the very first day (January 2, 2023)
todayButton.addEventListener("click", () => {
  timelineContainer.scrollTo({ left: 0, behavior: "smooth" });
});

// Optionally, show the Today button when scrolled away from the beginning
timelineContainer.addEventListener("scroll", () => {
  if (timelineContainer.scrollLeft > 50) {
    todayButton.style.display = "block";
  } else {
    todayButton.style.display = "none";
  }
});

// Initially, scroll to the first day
timelineContainer.scrollLeft = 0;
