"use strict";

const COLORS = ["#176b87", "#2f8f83", "#e28b3d", "#8057a6", "#d66078", "#6f8f45"];
const DONUT_COLORS = ["#176b87", "#e28b3d", "#2f8f83", "#8057a6", "#d66078", "#9aa8b5"];

const state = {
  performance: { school: -1, exam: 7, subject: 2 },
  comparison: { exam: 7, subject: 2, sortKey: "mean", sortAsc: false },
  choices: { school: -1 },
};

let dashboardData;
let summaryIndex;
let histogramIndex;

const $ = (id) => document.getElementById(id);
const key = (exam, school, subject) => `${exam}|${school}|${subject}`;
const fmt = (value, digits = 2) => Number.isFinite(value) ? Number(value).toFixed(digits) : "—";
const short = (text, limit = 13) => text.length > limit ? `${text.slice(0, limit)}…` : text;

function svgNode(tag, attrs = {}) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([name, value]) => node.setAttribute(name, value));
  return node;
}

function svgText(svg, text, x, y, className = "axis-label", anchor = "start") {
  const node = svgNode("text", { x, y, class: className, "text-anchor": anchor });
  node.textContent = text;
  svg.appendChild(node);
  return node;
}

function newSvg(container, height = 310, label = "数据图表") {
  container.innerHTML = "";
  const svg = svgNode("svg", { viewBox: `0 0 760 ${height}`, role: "img", "aria-label": label });
  container.appendChild(svg);
  return svg;
}

function empty(container) {
  container.innerHTML = "";
  container.appendChild($("emptyTemplate").content.cloneNode(true));
}

function schoolName(index) {
  return index === -1 ? "地区整体" : dashboardData.schools[index].name;
}

function buildIndexes() {
  summaryIndex = new Map();
  dashboardData.summaryRecords.forEach((record) => {
    const [exam, school, subject, n, mean, median, std, q1, q3, min, max] = record;
    summaryIndex.set(key(exam, school, subject), { exam, school, subject, n, mean, median, std, q1, q3, min, max });
  });
  histogramIndex = new Map();
  dashboardData.histogramRecords.forEach((record) => {
    const [exam, school, subject, min, max, counts] = record;
    histogramIndex.set(key(exam, school, subject), { min, max, counts });
  });
}

function summary(exam, school, subject) {
  return summaryIndex.get(key(exam, school, subject));
}

function schoolOptions() {
  return `<option value="-1">地区整体（全部学校）</option>${dashboardData.schools.map((item, index) => `<option value="${index}">${item.code} ${item.name}</option>`).join("")}`;
}

function examOptions() {
  return dashboardData.exams.map((item, index) => `<option value="${index}">${item.id} ${item.name}</option>`).join("");
}

function subjectOptions() {
  return dashboardData.subjects.map((item, index) => `<option value="${index}">${item}</option>`).join("");
}

function setupNavigation() {
  const available = new Set(["overview", "performance", "comparison", "choices", "method"]);
  const openView = (name, shouldScroll = false) => {
    const view = available.has(name) ? name : "overview";
    document.querySelectorAll("[data-panel]").forEach((panel) => {
      const active = panel.dataset.panel === view;
      panel.hidden = !active;
      panel.classList.toggle("active", active);
    });
    document.querySelectorAll(".nav-card").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (window.location.hash !== `#${view}`) history.replaceState(null, "", `#${view}`);
    if (shouldScroll) document.querySelector(".section-nav").scrollIntoView({ behavior: "smooth", block: "start" });
  };

  document.querySelectorAll(".nav-card").forEach((button) => {
    button.addEventListener("click", () => openView(button.dataset.view, true));
  });
  window.addEventListener("hashchange", () => openView(window.location.hash.slice(1)));
  openView(window.location.hash.slice(1));
}

function setupControls() {
  $("performanceSchool").innerHTML = schoolOptions();
  $("performanceExam").innerHTML = examOptions();
  $("performanceSubject").innerHTML = subjectOptions();
  $("comparisonExam").innerHTML = examOptions();
  $("comparisonSubject").innerHTML = subjectOptions();
  $("choiceSchool").innerHTML = schoolOptions();

  $("performanceSchool").value = "-1";
  $("performanceExam").value = "7";
  $("performanceSubject").value = "2";
  $("comparisonExam").value = "7";
  $("comparisonSubject").value = "2";
  $("choiceSchool").value = "-1";

  ["performanceSchool", "performanceExam", "performanceSubject"].forEach((id) => {
    $(id).addEventListener("change", () => {
      state.performance.school = Number($("performanceSchool").value);
      state.performance.exam = Number($("performanceExam").value);
      state.performance.subject = Number($("performanceSubject").value);
      renderPerformance();
    });
  });
  $("performanceReset").addEventListener("click", () => {
    state.performance = { school: -1, exam: 7, subject: 2 };
    $("performanceSchool").value = "-1";
    $("performanceExam").value = "7";
    $("performanceSubject").value = "2";
    renderPerformance();
  });

  ["comparisonExam", "comparisonSubject"].forEach((id) => {
    $(id).addEventListener("change", () => {
      state.comparison.exam = Number($("comparisonExam").value);
      state.comparison.subject = Number($("comparisonSubject").value);
      renderComparison();
    });
  });
  $("comparisonReset").addEventListener("click", () => {
    state.comparison.exam = 7;
    state.comparison.subject = 2;
    $("comparisonExam").value = "7";
    $("comparisonSubject").value = "2";
    renderComparison();
  });

  $("choiceSchool").addEventListener("change", () => {
    state.choices.school = Number($("choiceSchool").value);
    renderChoices();
  });
  $("choiceReset").addEventListener("click", () => {
    state.choices.school = -1;
    $("choiceSchool").value = "-1";
    renderChoices();
  });

  document.querySelectorAll("#comparisonTable th[data-key]").forEach((heading) => {
    heading.addEventListener("click", () => {
      const sortKey = heading.dataset.key;
      state.comparison.sortAsc = state.comparison.sortKey === sortKey ? !state.comparison.sortAsc : false;
      state.comparison.sortKey = sortKey;
      renderComparisonTable(comparisonRows());
    });
  });
}

function renderOverview() {
  const latest = dashboardData.metadata.latestExamIndex;
  const total = summary(latest, -1, 0);
  const choices = choiceRows(-1);
  const choiceTotal = choices.reduce((sum, item) => sum + item.count, 0);
  const topChoice = choices[0];
  $("overviewSchoolCount").textContent = dashboardData.schools.length.toLocaleString("zh-CN");
  $("overviewStudentCount").textContent = (total?.n || dashboardData.examRecordCounts[latest].students).toLocaleString("zh-CN");
  $("overviewExamCount").textContent = dashboardData.exams.length.toLocaleString("zh-CN");
  $("overviewTopChoice").textContent = topChoice?.combo || "—";
  $("overviewTopChoiceShare").textContent = topChoice ? `${topChoice.count.toLocaleString("zh-CN")} 人，占 ${(topChoice.count / choiceTotal * 100).toFixed(1)}%` : "—";

  const coreNames = ["语文", "数学", "英语"];
  const core = coreNames.map((name) => {
    const subject = dashboardData.subjects.indexOf(name);
    return { label: name, value: summary(latest, -1, subject)?.mean };
  });
  const highest = [...core].filter((item) => Number.isFinite(item.value)).sort((a, b) => b.value - a.value)[0];
  $("overviewSummary").innerHTML = `<span>读者速览</span><p>E8 高三二模覆盖 <strong>${total?.n.toLocaleString("zh-CN") || "—"}</strong> 名学生。三门主科中，<strong>${highest?.label || "—"}</strong>的地区平均分最高（${fmt(highest?.value)} 分）。人数最多的选科组合是<strong>${topChoice?.combo || "—"}</strong>。</p>`;
  horizontalBars($("coreAverageChart"), core, "平均分", "E8 三门主科平均分", null, null, " 分");
  verticalBars($("examSizeChart"), dashboardData.examRecordCounts.map((item) => ({ label: item.exam, value: item.students })), "人数", "各场考试参考人数", true);
}

function renderPerformance() {
  const { school, exam, subject } = state.performance;
  const current = summary(exam, school, subject);
  const region = summary(exam, -1, subject);
  const examInfo = dashboardData.exams[exam];
  const subjectName = dashboardData.subjects[subject];
  $("performanceContext").textContent = `${schoolName(school)} · ${examInfo.id} ${examInfo.name} · ${subjectName}`;

  $("performanceStudents").textContent = current ? current.n.toLocaleString("zh-CN") : "—";
  $("performanceMean").textContent = fmt(current?.mean);
  $("performanceMedian").textContent = fmt(current?.median);
  $("performanceMiddle").textContent = current ? `${fmt(current.q1, 1)}—${fmt(current.q3, 1)}` : "—";

  if (!current) {
    $("performanceSummary").innerHTML = "<span>结果解读</span><p>当前条件下没有可展示的成绩。</p>";
  } else if (school === -1) {
    $("performanceSummary").innerHTML = `<span>结果解读</span><p>${examInfo.id} ${subjectName}的地区平均分为 <strong>${fmt(current.mean)}</strong> 分，成绩中点为 <strong>${fmt(current.median)}</strong> 分；中间一半学生的成绩主要位于 <strong>${fmt(current.q1, 1)}—${fmt(current.q3, 1)}</strong> 分。</p>`;
  } else {
    const gap = current.mean - region.mean;
    const relation = Math.abs(gap) < 0.05 ? "与地区平均分基本持平" : `比地区平均分${gap > 0 ? "高" : "低"} <strong>${fmt(Math.abs(gap))}</strong> 分`;
    $("performanceSummary").innerHTML = `<span>结果解读</span><p>${schoolName(school)}的${subjectName}平均分为 <strong>${fmt(current.mean)}</strong> 分，${relation}；该校中间一半学生的成绩位于 <strong>${fmt(current.q1, 1)}—${fmt(current.q3, 1)}</strong> 分。</p>`;
  }

  renderHistogram($("distributionChart"), histogramIndex.get(key(exam, school, subject)));
  renderTrend();
}

function renderTrend() {
  const { school, subject } = state.performance;
  const start = subject === 0 ? dashboardData.metadata.totalTrendStartIndex : 0;
  const exams = dashboardData.exams.slice(start);
  const regionSeries = exams.map((_, offset) => summary(start + offset, -1, subject)?.mean ?? NaN);
  const series = [{ name: "地区整体", values: regionSeries, color: "#9aa8b5" }];
  if (school !== -1) {
    series.push({ name: schoolName(school), values: exams.map((_, offset) => summary(start + offset, school, subject)?.mean ?? NaN), color: COLORS[0] });
  }
  $("trendNote").textContent = subject === 0
    ? "E1、E2 总分构成不同，因此总分折线从 E3 开始；不同试卷难度仍可能影响分数。"
    : "不同考试难度不同，折线只用于观察，不代表绝对进步幅度。";
  lineChart($("trendChart"), exams.map((item) => item.id), series, "平均分", "历次考试平均分");
}

function comparisonRows() {
  const { exam, subject } = state.comparison;
  return dashboardData.schools.map((school, schoolIndex) => {
    const item = summary(exam, schoolIndex, subject);
    return item ? { ...item, school: `${school.code} ${school.name}` } : null;
  }).filter(Boolean);
}

function renderComparison() {
  const { exam, subject } = state.comparison;
  const rows = comparisonRows();
  const sorted = [...rows].sort((a, b) => b.mean - a.mean);
  const region = summary(exam, -1, subject);
  const top = sorted[0];
  const bottom = sorted.at(-1);
  const examInfo = dashboardData.exams[exam];
  const subjectName = dashboardData.subjects[subject];
  $("comparisonContext").textContent = `${examInfo.id} ${examInfo.name} · ${subjectName} · 按学校平均分比较`;
  $("comparisonSchools").textContent = rows.length.toLocaleString("zh-CN");
  $("comparisonRegionMean").textContent = fmt(region?.mean);
  $("comparisonTopMean").textContent = fmt(top?.mean);
  $("comparisonTopSchool").textContent = top?.school || "—";
  $("comparisonGap").textContent = top && bottom ? fmt(top.mean - bottom.mean) : "—";
  $("comparisonSummary").innerHTML = top && bottom
    ? `<span>结果解读</span><p>本次比较包含 <strong>${rows.length}</strong> 所学校。学校平均分最高为 <strong>${fmt(top.mean)}</strong> 分，最低为 <strong>${fmt(bottom.mean)}</strong> 分，相差 <strong>${fmt(top.mean - bottom.mean)}</strong> 分。排序反映本次考试结果，阅读时还需结合各校参考人数。</p>`
    : "<span>结果解读</span><p>当前条件下没有可比较的学校。</p>";
  horizontalBars($("rankingChart"), sorted.map((item) => ({ label: item.school, value: item.mean, note: `${item.n} 人` })), "平均分", "学校平均分排序");
  renderComparisonTable(rows);
}

function renderComparisonTable(rows) {
  const direction = state.comparison.sortAsc ? 1 : -1;
  const sortKey = state.comparison.sortKey;
  const ordered = [...rows].sort((a, b) => {
    if (typeof a[sortKey] === "string") return direction * a[sortKey].localeCompare(b[sortKey], "zh-CN");
    return direction * (a[sortKey] - b[sortKey]);
  });
  $("comparisonTable").querySelector("tbody").innerHTML = ordered.map((item) => `<tr><td>${item.school}</td><td>${item.n.toLocaleString("zh-CN")}</td><td>${fmt(item.mean)}</td><td>${fmt(item.median)}</td><td>${fmt(item.q1)}</td><td>${fmt(item.q3)}</td><td>${fmt(item.max)}</td></tr>`).join("");
}

function choiceRows(school) {
  return dashboardData.selectionCounts
    .filter((record) => record[0] === school)
    .map(([, combo, count]) => ({ combo, count }))
    .sort((a, b) => b.count - a.count);
}

function renderChoices() {
  const school = state.choices.school;
  const rows = choiceRows(school);
  const total = rows.reduce((sum, item) => sum + item.count, 0);
  const top = rows[0];
  $("choiceContext").textContent = `${schoolName(school)} · E8 高三二模 · 三门选考科目组合`;
  $("choiceStudents").textContent = total.toLocaleString("zh-CN");
  $("choiceComboCount").textContent = rows.length.toLocaleString("zh-CN");
  $("choiceLeadingCombo").textContent = top?.combo || "—";
  $("choiceLeadingShare").textContent = top ? `${(top.count / total * 100).toFixed(1)}%` : "—";

  const topTwo = rows.slice(0, 2);
  $("choiceSummary").innerHTML = top
    ? `<span>结果解读</span><p>${schoolName(school)}中人数最多的组合是 <strong>${top.combo}</strong>，共有 <strong>${top.count}</strong> 人，占 <strong>${(top.count / total * 100).toFixed(1)}%</strong>${topTwo[1] ? `；其次是 <strong>${topTwo[1].combo}</strong>（${(topTwo[1].count / total * 100).toFixed(1)}%）` : ""}。</p>`
    : "<span>结果解读</span><p>当前范围没有可展示的选科组合。</p>";
  renderChoicePie(rows, total);
  renderElectivePopularity(rows, total);
  $("choiceTable").querySelector("tbody").innerHTML = rows.map((item) => `<tr><td>${item.combo}</td><td>${item.count.toLocaleString("zh-CN")}</td><td>${(item.count / total * 100).toFixed(2)}%</td></tr>`).join("");
}

function renderChoicePie(rows, total) {
  const container = $("choicePie");
  container.innerHTML = "";
  if (!rows.length || !total) return empty(container);
  const display = rows.slice(0, 5).map((item) => ({ ...item }));
  const other = rows.slice(5).reduce((sum, item) => sum + item.count, 0);
  if (other) display.push({ combo: "其他组合", count: other });
  let current = 0;
  const stops = display.map((item, index) => {
    const start = current;
    current += item.count / total * 100;
    return `${DONUT_COLORS[index]} ${start}% ${current}%`;
  });
  const donut = document.createElement("div");
  donut.className = "donut";
  donut.style.background = `conic-gradient(${stops.join(",")})`;
  donut.innerHTML = `<div class="donut-center"><strong>${total.toLocaleString("zh-CN")}</strong><span>选科人数</span></div>`;
  const legend = document.createElement("div");
  legend.className = "legend";
  display.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "legend-item";
    row.innerHTML = `<span class="legend-dot" style="background:${DONUT_COLORS[index]}"></span><span>${item.combo}</span><strong>${(item.count / total * 100).toFixed(1)}%</strong>`;
    legend.appendChild(row);
  });
  container.append(donut, legend);
}

function renderElectivePopularity(rows, total) {
  const counts = new Map(dashboardData.electiveSubjects.map((subject) => [subject, 0]));
  rows.forEach((item) => item.combo.split("+").forEach((subject) => counts.set(subject, (counts.get(subject) || 0) + item.count)));
  const data = [...counts.entries()].map(([label, count]) => ({ label, value: total ? count / total * 100 : 0, note: `${count.toLocaleString("zh-CN")} 人` })).sort((a, b) => b.value - a.value);
  horizontalBars($("electivePopularityChart"), data, "选择率（%）", "六门选考科目选择率", 0, 100, "%");
}

function lineChart(container, labels, series, yTitle, ariaLabel) {
  const valid = series.flatMap((item) => item.values.filter(Number.isFinite));
  if (!valid.length) return empty(container);
  const svg = newSvg(container, 310, ariaLabel);
  const box = { l: 58, r: 26, t: 40, b: 48 };
  const width = 760 - box.l - box.r;
  const height = 310 - box.t - box.b;
  let minimum = Math.min(...valid);
  let maximum = Math.max(...valid);
  const padding = (maximum - minimum || 1) * 0.18;
  minimum -= padding;
  maximum += padding;
  const x = (index) => box.l + (labels.length === 1 ? width / 2 : index * width / (labels.length - 1));
  const y = (value) => box.t + (maximum - value) * height / (maximum - minimum);

  for (let index = 0; index <= 4; index += 1) {
    const value = minimum + (maximum - minimum) * index / 4;
    const yy = y(value);
    svg.appendChild(svgNode("line", { x1: box.l, y1: yy, x2: 760 - box.r, y2: yy, stroke: "#dce5e9" }));
    svgText(svg, fmt(value, 1), box.l - 9, yy + 4, "axis-label", "end");
  }
  labels.forEach((label, index) => svgText(svg, label, x(index), 285, "axis-label", "middle"));
  svgText(svg, yTitle, 14, 20, "axis-title");
  series.forEach((item, seriesIndex) => {
    const points = item.values.map((value, index) => Number.isFinite(value) ? `${x(index)},${y(value)}` : "").filter(Boolean).join(" ");
    svg.appendChild(svgNode("polyline", { points, fill: "none", stroke: item.color, "stroke-width": 3, "stroke-linejoin": "round", "stroke-linecap": "round" }));
    item.values.forEach((value, index) => {
      if (!Number.isFinite(value)) return;
      const circle = svgNode("circle", { cx: x(index), cy: y(value), r: 4.5, fill: item.color });
      const title = svgNode("title");
      title.textContent = `${item.name} ${labels[index]}：${fmt(value)} 分`;
      circle.appendChild(title);
      svg.appendChild(circle);
    });
    svg.appendChild(svgNode("rect", { x: 500 + seriesIndex * 122, y: 13, width: 16, height: 4, fill: item.color }));
    svgText(svg, short(item.name, 8), 523 + seriesIndex * 122, 20, "chart-legend");
  });
}

function renderHistogram(container, data) {
  if (!data || !data.counts.length) return empty(container);
  const svg = newSvg(container, 310, "当前成绩分布");
  const box = { l: 52, r: 20, t: 24, b: 52 };
  const width = 760 - box.l - box.r;
  const height = 310 - box.t - box.b;
  const maximumCount = Math.max(...data.counts);
  data.counts.forEach((count, index) => {
    const barWidth = width / data.counts.length - 3;
    const barHeight = maximumCount ? count / maximumCount * height : 0;
    const bar = svgNode("rect", { x: box.l + index * width / data.counts.length + 1.5, y: box.t + height - barHeight, width: barWidth, height: barHeight, fill: COLORS[0], rx: 3 });
    const title = svgNode("title");
    const left = data.min + (data.max - data.min) * index / data.counts.length;
    const right = data.min + (data.max - data.min) * (index + 1) / data.counts.length;
    title.textContent = `${fmt(left, 1)}—${fmt(right, 1)} 分：${count} 人`;
    bar.appendChild(title);
    svg.appendChild(bar);
  });
  for (let index = 0; index <= 4; index += 1) {
    const value = data.min + (data.max - data.min) * index / 4;
    svgText(svg, fmt(value, 0), box.l + index * width / 4, 286, "axis-label", "middle");
  }
  svgText(svg, "分数区间", 380, 307, "axis-title", "middle");
  svgText(svg, "人数", 12, 19, "axis-title");
}

function horizontalBars(container, rows, title, ariaLabel, fixedMin = null, fixedMax = null, suffix = "") {
  const valid = rows.filter((item) => Number.isFinite(item.value));
  if (!valid.length) return empty(container);
  const height = Math.max(300, valid.length * 29 + 58);
  const svg = newSvg(container, height, ariaLabel);
  const box = { l: 156, r: 92, t: 28, b: 30 };
  const width = 760 - box.l - box.r;
  const plotHeight = height - box.t - box.b;
  let minimum = fixedMin ?? Math.min(0, ...valid.map((item) => item.value));
  let maximum = fixedMax ?? Math.max(...valid.map((item) => item.value));
  if (fixedMax === null) maximum += (maximum - minimum || 1) * 0.08;
  const x = (value) => box.l + (value - minimum) * width / (maximum - minimum || 1);
  valid.forEach((item, index) => {
    const y = box.t + index * plotHeight / valid.length;
    const barHeight = Math.max(10, plotHeight / valid.length - 7);
    svgText(svg, short(item.label, 16), box.l - 9, y + barHeight * 0.8, "axis-label", "end");
    const bar = svgNode("rect", { x: x(minimum), y, width: Math.max(1, x(item.value) - x(minimum)), height: barHeight, fill: index === 0 ? COLORS[2] : COLORS[0], rx: 3 });
    const tooltip = svgNode("title");
    tooltip.textContent = `${item.label}：${fmt(item.value)}${suffix}${item.note ? `，${item.note}` : ""}`;
    bar.appendChild(tooltip);
    svg.appendChild(bar);
    svgText(svg, `${fmt(item.value)}${suffix}${item.note ? ` · ${item.note}` : ""}`, Math.min(752, x(item.value) + 6), y + barHeight * 0.8, "bar-value");
  });
  svgText(svg, title, 12, 18, "axis-title");
}

function verticalBars(container, rows, title, ariaLabel, integerLabels = false) {
  const valid = rows.filter((item) => Number.isFinite(item.value));
  if (!valid.length) return empty(container);
  const svg = newSvg(container, 310, ariaLabel);
  const box = { l: 58, r: 22, t: 30, b: 52 };
  const width = 760 - box.l - box.r;
  const height = 310 - box.t - box.b;
  const maximum = Math.max(...valid.map((item) => item.value)) * 1.12;
  for (let index = 0; index <= 4; index += 1) {
    const value = maximum * index / 4;
    const y = box.t + height - value / maximum * height;
    svg.appendChild(svgNode("line", { x1: box.l, y1: y, x2: 760 - box.r, y2: y, stroke: "#dce5e9" }));
    svgText(svg, integerLabels ? Math.round(value).toLocaleString("zh-CN") : fmt(value, 1), box.l - 8, y + 4, "axis-label", "end");
  }
  valid.forEach((item, index) => {
    const groupWidth = width / valid.length;
    const barWidth = groupWidth * 0.58;
    const barHeight = item.value / maximum * height;
    const x = box.l + index * groupWidth + (groupWidth - barWidth) / 2;
    const y = box.t + height - barHeight;
    const bar = svgNode("rect", { x, y, width: barWidth, height: barHeight, fill: index === valid.length - 1 ? COLORS[2] : COLORS[0], rx: 4 });
    const tooltip = svgNode("title");
    tooltip.textContent = `${item.label}：${integerLabels ? item.value.toLocaleString("zh-CN") : fmt(item.value)}`;
    bar.appendChild(tooltip);
    svg.appendChild(bar);
    svgText(svg, item.label, x + barWidth / 2, 286, "axis-label", "middle");
  });
  svgText(svg, title, 12, 19, "axis-title");
}

function renderAll() {
  renderOverview();
  renderPerformance();
  renderComparison();
  renderChoices();
}

async function init() {
  try {
    const response = await fetch("data/dashboard_data.json");
    if (!response.ok) throw new Error("无法读取网页数据");
    dashboardData = await response.json();
    buildIndexes();
    setupNavigation();
    setupControls();
    renderAll();
    $("statusText").textContent = "数据已载入。点击上方栏目进入对应分析页面。";
  } catch (error) {
    $("statusText").textContent = "网页数据未能读取。请按照 README 的说明，通过本地 HTTP 服务打开网页。";
    console.error(error);
  }
}

init();
