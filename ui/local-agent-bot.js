(function () {
  "use strict";

  var messagesEl = document.getElementById("messages");
  var messagesWrap = document.getElementById("messages-wrap");
  var form = document.getElementById("chat-form");
  var input = document.getElementById("chat-input");
  var introEl = document.getElementById("pex-intro");

  var drawer = document.getElementById("system-drawer");
  var backdrop = document.getElementById("drawer-backdrop");
  var btnPanel = document.getElementById("btn-system-panel");
  var btnClose = document.getElementById("btn-drawer-close");
  var taskListEl = document.getElementById("task-list");
  var promptCard = document.getElementById("prompt-card");
  var currentTaskEl = document.getElementById("current-task-detail");
  var btnRefresh = document.getElementById("btn-refresh-tasks");
  var btnPrompt = document.getElementById("btn-load-prompt");
  var brandIcon = document.querySelector(".pex-brand-icon");

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatReply(text) {
    var esc = escapeHtml(text);
    return esc
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\n/g, "<br/>");
  }

  function statusIconClass(status) {
    var s = (status || "").toUpperCase();
    if (s === "RUN_PENDING" || s === "PENDING") return "pex-status-icon--pending";
    if (s === "RUNNING") return "pex-status-icon--running";
    if (s === "RUN_DONE") return "pex-status-icon--done";
    if (s === "FAILED") return "pex-status-icon--failed";
    return "pex-status-icon--other";
  }

  function appendBubble(role, html) {
    var div = document.createElement("div");
    div.className =
      "pex-msg " + (role === "user" ? "pex-msg-user" : "pex-msg-bot");
    div.innerHTML = html;
    messagesEl.appendChild(div);
    scrollMessagesToEnd();
  }

  function scrollMessagesToEnd() {
    messagesWrap.scrollTop = messagesWrap.scrollHeight;
  }

  function focusInput() {
    if (input && typeof input.focus === "function") {
      input.focus({ preventScroll: true });
    }
  }

  function autoResizeTextarea() {
    input.style.height = "auto";
    var max = 160;
    input.style.height = Math.min(input.scrollHeight, max) + "px";
  }

  function renderCurrentTask(tasks) {
    var active = (tasks || []).find(function (t) {
      var s = (t.status || "").toUpperCase();
      return s === "RUN_PENDING" || s === "RUNNING";
    });
    if (!active) {
      currentTaskEl.innerHTML =
        '<p class="pex-current-empty">RUN_PENDING / RUNNING 없음</p>';
      return;
    }
    currentTaskEl.innerHTML =
      '<div class="pex-detail-row"><div class="pex-detail-k">Task ID</div><div class="pex-detail-v">' +
      escapeHtml(active.id) +
      "</div></div>" +
      '<div class="pex-detail-row"><div class="pex-detail-k">Status</div><div class="pex-detail-v"><span class="pex-task-status-label">' +
      escapeHtml(active.status) +
      "</span></div></div>" +
      '<div class="pex-detail-row"><div class="pex-detail-k">Created</div><div class="pex-detail-v">' +
      escapeHtml(active.createdAt) +
      "</div></div>" +
      '<div class="pex-detail-row"><div class="pex-detail-k">Project</div><div class="pex-detail-v">' +
      escapeHtml(active.project || "") +
      "</div></div>";
  }

  async function refreshTasks() {
    try {
      var res = await fetch("/api/tasks?limit=10");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      var tasks = data.tasks || [];
      renderCurrentTask(tasks);
      if (!taskListEl) return;
      if (!tasks.length) {
        taskListEl.innerHTML =
          '<div class="pex-task-empty" role="listitem">작업 없음</div>';
        return;
      }
      taskListEl.innerHTML = tasks
        .map(function (t) {
          var ic = statusIconClass(t.status);
          return (
            '<div class="pex-task-item" role="listitem">' +
            '<span class="pex-status-icon ' +
            ic +
            '" title="' +
            escapeHtml(t.status) +
            '"></span>' +
            '<div class="pex-task-body">' +
            '<div class="pex-task-id">' +
            escapeHtml(t.id) +
            "</div>" +
            '<div class="pex-task-meta"><span class="pex-task-status-label">' +
            escapeHtml(t.status) +
            "</span> · " +
            escapeHtml(t.createdAt) +
            "</div>" +
            "</div></div>"
          );
        })
        .join("");
    } catch (e) {
      if (taskListEl) {
        taskListEl.innerHTML =
          '<div class="pex-task-empty">목록 실패: ' +
          escapeHtml(String(e)) +
          "</div>";
      }
    }
  }

  async function refreshLastPromptCard() {
    try {
      var res = await fetch("/api/last-build-prompt");
      if (!res.ok) throw new Error("HTTP " + res.status);
      var data = await res.json();
      if (!data.ok) {
        promptCard.textContent = data.error || "(프롬프트 없음)";
        return;
      }
      var head =
        "task: " + data.taskId + "\npath: " + data.path + "\n\n---\n\n";
      promptCard.textContent = head + (data.content || "");
    } catch (e) {
      promptCard.textContent = "불러오기 실패: " + String(e);
    }
  }

  function openDrawer() {
    drawer.removeAttribute("hidden");
    backdrop.removeAttribute("hidden");
    requestAnimationFrame(function () {
      drawer.classList.add("pex-drawer--open");
    });
    btnPanel.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawer.classList.remove("pex-drawer--open");
    btnPanel.setAttribute("aria-expanded", "false");
    backdrop.setAttribute("hidden", "");
    document.body.style.overflow = "";
    window.setTimeout(function () {
      drawer.setAttribute("hidden", "");
    }, 240);
  }

  function toggleDrawer() {
    if (drawer.classList.contains("pex-drawer--open")) closeDrawer();
    else openDrawer();
  }

  async function sendChat(text) {
    var res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ message: text }),
    });
    var data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error("응답 JSON 파싱 실패");
    }
    if (!res.ok) {
      throw new Error(data.error || "요청 실패");
    }
    return data;
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var text = (input.value || "").trim();
    if (!text) return;

    if (introEl) introEl.style.display = "none";

    appendBubble("user", escapeHtml(text).replace(/\n/g, "<br/>"));
    input.value = "";
    autoResizeTextarea();

    if (brandIcon) brandIcon.classList.add("pex-brand-icon--working");
    try {
      var data = await sendChat(text);
      appendBubble("bot", formatReply(data.reply || ""));
    } catch (err) {
      console.error("[NeO] /api/chat error:", err);
      appendBubble("bot", escapeHtml(String(err.message || err)));
    } finally {
      if (brandIcon) brandIcon.classList.remove("pex-brand-icon--working");
    }

    try {
      await refreshTasks();
      await refreshLastPromptCard();
    } catch (e2) {
      console.warn("[NeO] refresh after chat:", e2);
    }
    focusInput();
    scrollMessagesToEnd();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  input.addEventListener("input", autoResizeTextarea);

  btnPanel.addEventListener("click", toggleDrawer);
  btnClose.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);

  btnRefresh.addEventListener("click", function () {
    refreshTasks();
  });
  btnPrompt.addEventListener("click", function () {
    refreshLastPromptCard();
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden) focusInput();
  });

  window.addEventListener("load", function () {
    focusInput();
    autoResizeTextarea();
  });

  refreshTasks();
  refreshLastPromptCard();
  setInterval(refreshTasks, 12000);
})();
