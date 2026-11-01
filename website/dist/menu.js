// The Tools menu: a tab per group on the left, that group's tools on the
// right, and a search box on top that finds tools and "x to y" conversions.
// Ctrl+K or / opens it with the search box focused.
import { tools, groups } from './tools.js';
import { FORMATS } from './convert.js';
import { searchAll } from './search.js';
import { routeNote } from './notes.js';

const $ = (id) => document.getElementById(id);
let current = groups[0].id;

function iconFor(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + name); svg.append(use);
  return svg;
}

function item(href, iconName, title, text, status) {
  const link = document.createElement('a');
  link.href = href; link.className = 'menu-item';
  const body = document.createElement('span');
  const strong = document.createElement('strong'); strong.textContent = title;
  if (status) { const chip = document.createElement('span'); chip.className = 'status new'; chip.textContent = status; strong.append(' ', chip); }
  const small = document.createElement('small'); small.textContent = text;
  body.append(strong, small);
  link.append(iconFor(iconName), body);
  return link;
}

function showGroup(id) {
  current = id;
  for (const tab of $('menu-tabs').children) { const on = tab.dataset.group === id; tab.setAttribute('aria-selected', on); tab.tabIndex = on ? 0 : -1; }
  const group = groups.find((g) => g.id === id);
  const head = document.createElement('p'); head.className = 'menu-blurb'; head.textContent = group.blurb;
  const list = tools.filter((t) => t.group === id && t.state === 'ready').map((t) => item('#' + t.id, t.icon, t.title, t.description, ''));
  $('menu-panel').replaceChildren(head, ...list);
  $('menu-panel').setAttribute('aria-labelledby', 'menu-tab-' + id);
}

function showResults(query) {
  const results = searchAll(query);
  $('menu-body').hidden = !!query.trim();
  $('menu-results').hidden = !query.trim();
  if (!query.trim()) return;
  if (!results.length) {
    const none = document.createElement('p'); none.className = 'menu-empty';
    none.textContent = 'Nothing matches “' + query.trim() + '”. Try a format like “pdf”, or “mp3 to wav”.';
    $('menu-results').replaceChildren(none);
    return;
  }
  $('menu-results').replaceChildren(...results.map((r) => r.kind === 'tool'
    ? item('#' + r.tool.id, r.tool.icon, r.tool.title, r.tool.description, '')
    : item('#convert?from=' + r.from + '&to=' + r.to, 'swap', FORMATS[r.from].label + ' to ' + FORMATS[r.to].label, routeNote(r.from, r.to).rows[0]?.[1] || 'Convert on this device', '')));
}

export function initMenu() {
  $('menu-tabs').replaceChildren(...groups.map((group) => {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.role = 'tab'; tab.id = 'menu-tab-' + group.id; tab.dataset.group = group.id;
    tab.textContent = group.title;
    tab.addEventListener('click', () => showGroup(group.id));
    tab.addEventListener('mouseenter', () => { if (matchMedia('(hover: hover)').matches) showGroup(group.id); });
    return tab;
  }));
  $('menu-tabs').addEventListener('keydown', (event) => {
    const ids = groups.map((g) => g.id), i = ids.indexOf(current);
    const step = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    showGroup(ids[(i + step + ids.length) % ids.length]);
    $('menu-tab-' + current).focus();
  });
  showGroup(current);
  $('menu-search').addEventListener('input', () => showResults($('menu-search').value));
  $('menu-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { const first = document.querySelector('#menu-results a'); if (first) { event.preventDefault(); first.click(); } }
    if (event.key === 'ArrowDown') { const first = document.querySelector('#menu-results:not([hidden]) a, #menu-panel a'); if (first) { event.preventDefault(); first.focus(); } }
  });
  $('tools-menu').addEventListener('toggle', () => {
    if ($('tools-menu').open) { const tool = location.hash.slice(1).split('?')[0]; const group = tools.find((t) => t.id === tool)?.group; if (group) showGroup(group); }
    else { $('menu-search').value = ''; showResults(''); }
  });
  $('search-button').addEventListener('click', () => openSearch());
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) { event.preventDefault(); openSearch(); }
  });
}

export function openSearch() {
  $('tools-menu').open = true;
  requestAnimationFrame(() => $('menu-search').focus());
}
