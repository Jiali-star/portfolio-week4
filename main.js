/* ============================================================
   Shared site behavior
   - Sticky header shadow on scroll
   - Mobile hamburger menu
   - Scroll-reveal animations
   - Footer year
   - Contact form friendly confirmation
   ============================================================ */

(function () {
  "use strict";

  /* ---------- Sticky header shadow ---------- */
  var header = document.querySelector(".header");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------- Mobile navigation ---------- */
  var menuToggle = document.getElementById("menu-toggle");
  var navLinks = document.getElementById("nav-links");

  if (menuToggle && navLinks) {
    menuToggle.addEventListener("click", function () {
      var isOpen = navLinks.classList.toggle("is-open");
      menuToggle.classList.toggle("is-open", isOpen);
      menuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      menuToggle.setAttribute(
        "aria-label",
        isOpen ? "Close menu" : "Open menu"
      );
    });

    // Close the menu after tapping a link
    navLinks.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        navLinks.classList.remove("is-open");
        menuToggle.classList.remove("is-open");
        menuToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* ---------- Scroll-reveal animations ---------- */
  var revealEls = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window && revealEls.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );

    revealEls.forEach(function (el) {
      observer.observe(el);
    });
  } else {
    // No observer support — just show everything
    revealEls.forEach(function (el) {
      el.classList.add("is-visible");
    });
  }

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  /* ---------- Contact form (front-end demo) ---------- */
  var form = document.getElementById("contact-form");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      var note = document.getElementById("form-note");
      if (note) {
        note.classList.add("is-visible");
        note.textContent =
          "Thanks for reaching out! Your message has been noted — I'll get back to you soon.";
      }
      form.reset();
    });
  }
})();

/* ============================================================
   Projects page — Interactive To-Do List
   - Month calendar with date selection
   - Add / toggle / edit / delete tasks
   - Syncs to a Supabase `todos` table
   ============================================================ */
(function () {
  "use strict";

  var listEl = document.getElementById("todo-list");
  if (!listEl) return;

  var formEl = document.getElementById("todo-form");
  var inputEl = document.getElementById("todo-task");
  var calWidget = document.getElementById("todo-calendar");
  var calBody = document.getElementById("todo-cal-body");
  var calTitle = document.getElementById("todo-cal-title");
  var selectedLabel = document.getElementById("todo-selected-date");
  var countEl = document.getElementById("todo-count");
  var emptyEl = document.getElementById("todo-empty");

  var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  var SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  /* ---------- Supabase client ---------- */
  var SUPABASE_URL = "https://klxsmjxhvhmplmhmcykd.supabase.co";
  var SUPABASE_KEY = "sb_publishable_tiSa1unyWLRIsjPw2M64CQ_x12ZYkSh";
  var supa = null;
  if (window.supabase && typeof window.supabase.createClient === "function") {
    try {
      supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.error("Supabase init failed:", e);
    }
  }

  var today = atStartOfDay(new Date());
  var viewMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  var selectedDate = new Date(today);
  var tasks = [];
  var selectedEmoji = "\u{1F4DD}";
  var selectedPriority = "medium";
  var selectedTime = "";

  /* ---------- storage (Supabase) ---------- */
  // `todos` table columns: id (int), task (text), is_complete (bool),
  // date (date), created_at (timestamptz), emoji (text), priority (text),
  // time (text — '' means "all day").
  function mapRow(r) {
    return {
      id: r.id,
      text: r.task !== undefined ? r.task : r.text,
      date: typeof r.date === "string" ? r.date : (r.date ? isoDate(parseIso(r.date)) : ""),
      emoji: r.emoji || "\u{1F4DD}",
      priority: r.priority || "medium",
      time: r.time || "",
      done: r.is_complete !== undefined ? !!r.is_complete : !!r.done,
      createdAt: r.created_at ? new Date(r.created_at).getTime() : 0
    };
  }
  function fetchTasks() {
    if (!supa) return Promise.resolve([]);
    return supa
      .from("todos")
      .select("*")
      .order("date", { ascending: true })
      .order("created_at", { ascending: true })
      .then(function (res) {
        if (res.error) throw res.error;
        // renderList() does the final date->time->createdAt sort in JS so
        // all-day tasks (time === '') sink to the bottom of each day group.
        return (res.data || []).map(mapRow);
      });
  }
  function insertTask(t) {
    var row = {
      task: t.text,
      date: t.date,
      emoji: t.emoji || "\u{1F4DD}",
      priority: t.priority || "medium",
      time: t.time || "",
      is_complete: !!t.done
    };
    return supa
      .from("todos")
      .insert(row)
      .select("*")
      .then(function (res) {
        if (res.error) throw res.error;
        return mapRow(res.data[0]);
      });
  }
  function updateTask(id, patch) {
    // Map local field names -> DB column names
    var row = {};
    if ("text" in patch) row.task = patch.text;
    if ("done" in patch) row.is_complete = patch.done;
    if ("emoji" in patch) row.emoji = patch.emoji;
    if ("priority" in patch) row.priority = patch.priority;
    if ("time" in patch) row.time = patch.time || "";
    return supa
      .from("todos")
      .update(row)
      .eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
      });
  }
  function removeTask(id) {
    return supa
      .from("todos")
      .delete()
      .eq("id", id)
      .then(function (res) {
        if (res.error) throw res.error;
      });
  }

  /* ---------- UI status helpers ---------- */
  var addBtn = formEl ? formEl.querySelector(".todo-add") : null;
  function setSaving(isOn) {
    if (!addBtn) return;
    addBtn.disabled = !!isOn;
    addBtn.classList.toggle("is-loading", !!isOn);
    addBtn.textContent = isOn ? "Saving…" : "Add";
  }
  function showError(msg) {
    if (!emptyEl) return;
    emptyEl.textContent = msg;
    emptyEl.classList.add("is-error");
    emptyEl.classList.remove("is-hidden");
  }
  function fmtErr(err, fallback) {
    var m = err && err.message ? err.message : String(err);
    if (m.length > 140) m = m.slice(0, 137) + "...";
    return fallback + " (" + m + ")";
  }
  function clearError() {
    if (!emptyEl) return;
    emptyEl.textContent = "No tasks yet — pick a date and add one!";
    emptyEl.classList.remove("is-error");
  }

  /* ---------- date helpers ---------- */
  function atStartOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() &&
           a.getMonth() === b.getMonth() &&
           a.getDate() === b.getDate();
  }
  function formatShort(d) {
    return SHORT_MONTHS[d.getMonth()] + " " + d.getDate();
  }
  function formatLabel(d) {
    if (sameDay(d, today)) return "today";
    var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (sameDay(d, tomorrow)) return "tomorrow";
    return formatShort(d);
  }
  function formatTime(hhmm) {
    if (!hhmm) return "";
    var p = hhmm.split(":");
    var h = parseInt(p[0], 10);
    var m = p[1];
    var suffix = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ":" + m + " " + suffix;
  }
  function priorityFires(p) {
    if (p === "low") return "\u{1F525}";
    if (p === "high") return "\u{1F525}\u{1F525}\u{1F525}";
    return "\u{1F525}\u{1F525}"; // medium (default)
  }
  function isoDate(d) {
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function parseIso(iso) {
    var p = iso.split("-");
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function hasTaskOn(date) {
    return tasks.some(function (t) { return sameDay(parseIso(t.date), date); });
  }

  /* ---------- calendar render ---------- */
  function renderCalendar() {
    calTitle.textContent = MONTHS[viewMonth.getMonth()] + " " + viewMonth.getFullYear();
    var first = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
    var startWeekday = first.getDay();
    var daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    var cells = [];

    for (var i = 0; i < startWeekday; i++) cells.push(null);
    for (var d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    while (cells.length % 7 !== 0) cells.push(null);

    var html = "";
    for (var row = 0; row < cells.length; row += 7) {
      html += "<tr>";
      for (var c = row; c < row + 7; c++) {
        var date = cells[c];
        if (!date) {
          html += '<td class="todo-cal-cell is-blank"></td>';
        } else {
          var classes = ["todo-cal-cell"];
          if (sameDay(date, today)) classes.push("is-today");
          if (sameDay(date, selectedDate)) classes.push("is-selected");
          if (hasTaskOn(date)) classes.push("has-tasks");
          html += '<td class="' + classes.join(" ") + '">' +
                  '<button type="button" data-date="' + isoDate(date) + '">' +
                  date.getDate() + '</button></td>';
        }
      }
      html += "</tr>";
    }
    calBody.innerHTML = html;
  }

  /* ---------- list render ---------- */
  function buildItem(t) {
    var li = document.createElement("li");
    li.className = "todo-item" + (t.done ? " is-done" : "");
    li.dataset.id = t.id;

    var check = document.createElement("button");
    check.type = "button";
    check.className = "todo-check" + (t.done ? " is-checked" : "");
    check.setAttribute("role", "checkbox");
    check.setAttribute("aria-checked", t.done ? "true" : "false");
    check.setAttribute("aria-label", t.done ? "Mark as not done" : "Mark as done");
    check.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';

    var body = document.createElement("div");
    body.className = "todo-body";

    var text = document.createElement("div");
    text.className = "todo-text";
    var emoji = document.createElement("span");
    emoji.className = "todo-emoji-inline";
    emoji.textContent = t.emoji || "📝";
    var textVal = document.createElement("span");
    textVal.className = "todo-text-value";
    textVal.title = "Click to edit";
    textVal.textContent = t.text;
    text.appendChild(emoji);
    text.appendChild(textVal);

    var meta = document.createElement("div");
    meta.className = "todo-meta";
    var pr = t.priority || "medium";
    var badge = document.createElement("span");
    badge.className = "todo-priority-badge";
    badge.dataset.priority = pr;
    badge.title = pr.charAt(0).toUpperCase() + pr.slice(1) + " priority";
    badge.setAttribute("aria-label", pr + " priority");
    badge.textContent = priorityFires(pr);
    meta.appendChild(badge);
    if (t.time) {
      var timeChip = document.createElement("span");
      timeChip.className = "todo-time-chip";
      timeChip.textContent = formatTime(t.time);
      meta.appendChild(timeChip);
    }

    body.appendChild(text);
    body.appendChild(meta);

    var del = document.createElement("button");
    del.type = "button";
    del.className = "todo-del";
    del.setAttribute("aria-label", "Delete task");
    del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

    li.appendChild(check);
    li.appendChild(body);
    li.appendChild(del);
    return li;
  }

  function groupDayLabel(d) {
    if (sameDay(d, today)) return "Today";
    var tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    if (sameDay(d, tomorrow)) return "Tomorrow";
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  }

  function renderList() {
    var sorted = tasks.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Within one day: unfinished tasks (0) above completed ones (1)
      if (a.done !== b.done) return a.done ? 1 : -1;
      var ta = a.time || "99:99";
      var tb = b.time || "99:99";
      if (ta !== tb) return ta < tb ? -1 : 1;
      return a.createdAt - b.createdAt;
    });

    listEl.innerHTML = "";

    var groups = [];
    var current = null;
    sorted.forEach(function (t) {
      if (!current || current.key !== t.date) {
        current = { key: t.date, date: parseIso(t.date), items: [] };
        groups.push(current);
      }
      current.items.push(t);
    });

    groups.forEach(function (g) {
      var group = document.createElement("div");
      group.className = "todo-group";

      var dateCol = document.createElement("div");
      dateCol.className = "todo-group-date";
      var day = document.createElement("span");
      day.className = "todo-group-day";
      day.textContent = groupDayLabel(g.date);
      var sub = document.createElement("span");
      sub.className = "todo-group-sub";
      sub.textContent = formatShort(g.date);
      dateCol.appendChild(day);
      dateCol.appendChild(sub);

      var items = document.createElement("ul");
      items.className = "todo-group-items";
      g.items.forEach(function (t) {
        items.appendChild(buildItem(t));
      });

      group.appendChild(dateCol);
      group.appendChild(items);
      listEl.appendChild(group);
    });

    var total = tasks.length;
    var done = tasks.filter(function (t) { return t.done; }).length;
    countEl.textContent = total === 0
      ? "0 tasks"
      : done + " of " + total + " tasks completed";

    emptyEl.classList.toggle("is-hidden", tasks.length > 0);
  }

  function updateSelectedLabel() {
    selectedLabel.textContent = formatLabel(selectedDate);
  }

  /* ---------- actions ---------- */
  function addTask(text) {
    var draft = {
      text: text,
      date: isoDate(selectedDate),
      emoji: selectedEmoji,
      priority: selectedPriority,
      time: selectedTime,
      done: false
    };
    setSaving(true);
    clearError();
    insertTask(draft).then(function (saved) {
      tasks.push(saved);
      renderList();
      renderCalendar();
    }).catch(function (err) {
      console.error("Insert failed:", err);
      showError(fmtErr(err, "Could not save this task"));
    }).finally(function () {
      setSaving(false);
    });
  }

  function toggleTask(id) {
    var t = tasks.find(function (x) { return String(x.id) === String(id); });
    if (!t) return;
    var nextDone = !t.done;
    t.done = nextDone;
    renderList();
    updateTask(id, { done: nextDone }).catch(function (err) {
      console.error("Toggle failed:", err);
      t.done = !nextDone;
      renderList();
      showError(fmtErr(err, "Could not update the task — reverted"));
    });
  }

  function deleteTask(id) {
    var backup = tasks.find(function (x) { return String(x.id) === String(id); });
    tasks = tasks.filter(function (t) { return String(t.id) !== String(id); });
    renderList();
    renderCalendar();
    removeTask(id).catch(function (err) {
      console.error("Delete failed:", err);
      if (backup) tasks.push(backup);
      renderList();
      renderCalendar();
      showError(fmtErr(err, "Could not delete the task — restored"));
    });
  }

  /* ---------- events ---------- */
  formEl.addEventListener("submit", function (e) {
    e.preventDefault();
    var v = inputEl.value.trim();
    if (!v) return;
    addTask(v);
    inputEl.value = "";
    resetPickers();
    inputEl.focus();
  });

  /* ---------- emoji + priority + time pickers ---------- */
  var emojiRow = document.getElementById("todo-emoji-row");
  var priorityRow = document.getElementById("todo-priority-row");
  var timeRow = document.getElementById("todo-time-row");

  if (emojiRow) {
    emojiRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo-emoji");
      if (!btn) return;
      selectedEmoji = btn.dataset.emoji;
      emojiRow.querySelectorAll(".todo-emoji").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      inputEl.focus();
    });
  }

  if (priorityRow) {
    priorityRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo-priority");
      if (!btn) return;
      selectedPriority = btn.dataset.priority;
      priorityRow.querySelectorAll(".todo-priority").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      inputEl.focus();
    });
  }

  var customTimeInput = document.getElementById("todo-time-native");
  var customTimeLabel = document.querySelector(".todo-time-label");

  if (timeRow) {
    timeRow.addEventListener("click", function (e) {
      var btn = e.target.closest(".todo-time");
      if (!btn) return;
      // Custom time is handled by the native <input type="time"> below
      if (btn.classList.contains("todo-time--custom")) return;
      selectedTime = btn.dataset.time;
      timeRow.querySelectorAll(".todo-time").forEach(function (b) {
        b.classList.toggle("is-active", b === btn);
      });
      // Reset the custom picker display since a preset was chosen
      if (customTimeLabel) customTimeLabel.textContent = "Custom";
      if (customTimeInput) customTimeInput.value = "";
      inputEl.focus();
    });
  }

  if (customTimeInput) {
    customTimeInput.addEventListener("input", function () {
      var v = customTimeInput.value; // "HH:MM" or ""
      selectedTime = v;
      if (customTimeLabel) {
        customTimeLabel.textContent = v ? formatTime(v) : "Custom";
      }
      // Deactivate preset chips, activate the Custom label
      if (timeRow) {
        timeRow.querySelectorAll(".todo-time").forEach(function (b) {
          if (b.classList.contains("todo-time--custom")) {
            b.classList.add("is-active");
          } else {
            b.classList.remove("is-active");
          }
        });
      }
    });
  }

  function resetPickers() {
    selectedEmoji = "\u{1F4DD}";
    selectedPriority = "medium";
    selectedTime = "";
    if (emojiRow) {
      emojiRow.querySelectorAll(".todo-emoji").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.emoji === selectedEmoji);
      });
    }
    if (priorityRow) {
      priorityRow.querySelectorAll(".todo-priority").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.priority === selectedPriority);
      });
    }
    if (timeRow) {
      timeRow.querySelectorAll(".todo-time").forEach(function (b) {
        b.classList.toggle("is-active", b.dataset.time === selectedTime);
      });
    }
    if (customTimeLabel) customTimeLabel.textContent = "Custom";
    if (customTimeInput) customTimeInput.value = "";
  }

  listEl.addEventListener("click", function (e) {
    var li = e.target.closest(".todo-item");
    if (!li) return;
    var id = li.dataset.id;
    if (e.target.closest(".todo-del")) {
      deleteTask(id);
    } else if (e.target.closest(".todo-check")) {
      toggleTask(id);
    } else if (
      e.target.closest(".todo-text") &&
      !e.target.closest(".todo-edit-input")
    ) {
      editItem(li);
    }
  });

  function editItem(li) {
    if (li.querySelector(".todo-edit-input")) return; // already editing
    var id = li.dataset.id;
    var t = tasks.find(function (x) { return String(x.id) === String(id); });
    if (!t) return;
    var valueEl = li.querySelector(".todo-text-value");
    if (!valueEl) return;

    var input = document.createElement("input");
    input.type = "text";
    input.className = "todo-edit-input";
    input.value = t.text;
    input.maxLength = 120;
    input.setAttribute("aria-label", "Edit task text");
    valueEl.replaceWith(input);
    input.focus();
    input.select();

    var settled = false;
    function commit() {
      if (settled) return;
      settled = true;
      var v = input.value.trim();
      if (v && v !== t.text) {
        var oldText = t.text;
        t.text = v;
        renderList();
        updateTask(t.id, { text: v }).catch(function (err) {
          console.error("Edit failed:", err);
          t.text = oldText;
          renderList();
          showError(fmtErr(err, "Could not save your edit — reverted"));
        });
      } else {
        renderList();
      }
    }
    function cancel() {
      if (settled) return;
      settled = true;
      renderList();
    }
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.keyCode === 13) {
        e.preventDefault();
        commit();
      } else if (e.key === "Escape" || e.keyCode === 27) {
        e.preventDefault();
        cancel();
      }
    });
    input.addEventListener("blur", commit);
  }

  calWidget.addEventListener("click", function (e) {
    var nav = e.target.closest(".todo-cal-nav");
    if (nav) {
      var dir = nav.dataset.dir === "next" ? 1 : -1;
      viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + dir, 1);
      renderCalendar();
      return;
    }
    var cellBtn = e.target.closest("[data-date]");
    if (cellBtn) {
      selectedDate = parseIso(cellBtn.dataset.date);
      updateSelectedLabel();
      renderCalendar();
    }
  });

  /* ---------- init ---------- */
  updateSelectedLabel();
  renderCalendar();
  renderList();
  if (supa) {
    setSaving(true);
    fetchTasks().then(function (rows) {
      tasks = rows;
      renderList();
      renderCalendar();
    }).catch(function (err) {
      console.error("Load failed:", err);
      showError(fmtErr(err, "Could not load tasks from Supabase"));
    }).finally(function () {
      setSaving(false);
    });
  } else {
    showError("Supabase SDK failed to load — to-do app is offline.");
  }
})();
