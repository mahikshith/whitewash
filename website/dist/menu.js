// Search finds tools and "x to y" conversions. Ctrl+K or / opens it. Browsing
// happens in the header tabs instead, one per kind of file.
import { sections } from './sections.js';
import { FORMATS } from './convert.js';
import { searchAll } from './search.js';
import { routeNote } from './notes.js';

const $ = (id) => document.getElementById(id);
function iconFor(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', '#' + name); svg.append(use);
  return svg;
}

function item(href, iconName, title, text) {
  const link = document.createElement('a');
  link.href = href; link.className = 'menu-item';
  const body = document.createElement('span');
  const strong = document.createElement('strong'); strong.textContent = title;
  const small = document.createElement('small'); small.textContent = text;
  body.append(strong, small);
  link.append(iconFor(iconName), body);
  return link;
}

const SUGGEST = ['humanize word', 'pdf to word', 'compress pdf', 'jpg to png', 'mp4 to mp3', 'unzip'];
function suggestions() {
  const box = document.createElement('div'); box.className = 'menu-suggest';
  const label = document.createElement('p'); label.className = 'menu-blurb'; label.textContent = 'Try';
  box.append(label, ...SUGGEST.map((q) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = q;
    b.addEventListener('click', () => { $('menu-search').value = q; showResults(q); $('menu-search').focus(); });
    return b;
  }));
  return box;
}

function showResults(query) {
  const results = searchAll(query);
  $('menu-body').hidden = true;
  $('menu-results').hidden = false;
  if (!query.trim()) { $('menu-results').replaceChildren(suggestions()); return; }
  if (!results.length) {
    const none = document.createElement('p'); none.className = 'menu-empty';
    none.textContent = 'Nothing matches “' + query.trim() + '”. Try a format like “pdf”, or “mp3 to wav”.';
    $('menu-results').replaceChildren(none);
    return;
  }
  $('menu-results').replaceChildren(...results.map((r) => r.kind === 'tool'
    ? item('#' + r.tool.id, r.tool.icon, r.tool.title, r.tool.description)
    : item('#convert?from=' + r.from + '&to=' + r.to, 'swap', FORMATS[r.from].label + ' to ' + FORMATS[r.to].label, routeNote(r.from, r.to).rows[0]?.[1] || 'Convert on this device')));
}

export function initMenu() {
  showResults('');
  $('menu-search').addEventListener('input', () => showResults($('menu-search').value));
  $('menu-search').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { const first = document.querySelector('#menu-results a'); if (first) { event.preventDefault(); first.click(); } }
    if (event.key === 'ArrowDown') { const first = document.querySelector('#menu-results a, #menu-results button'); if (first) { event.preventDefault(); first.focus(); } }
  });
  $('tools-menu').addEventListener('toggle', () => {
    if (!$('tools-menu').open) { $('menu-search').value = ''; showResults(''); }
  });
  document.addEventListener('keydown', (event) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((event.key === 'k' && (event.metaKey || event.ctrlKey)) || (event.key === '/' && !typing)) { event.preventDefault(); openSearch(); }
  });
}

export function openSearch() {
  $('tools-menu').open = true;
  requestAnimationFrame(() => $('menu-search').focus());
}

// The tabs across the header, one per kind of file. Each opens its page;
// hovering or focusing it drops down every option, grouped by job.
function dropLink(leaf) {
  const a = document.createElement('a'); a.href = leaf.href; a.className = 'drop-link';
  a.textContent = leaf.title; a.title = leaf.description;
  return a;
}

export function initTabs() {
  $('section-tabs').replaceChildren(...sections.map((section) => {
    const tab = document.createElement('div'); tab.className = 'tab';
    const link = document.createElement('a');
    link.href = '#' + section.id; link.className = 'tab-link'; link.dataset.section = section.id;
    link.textContent = section.title;
    const panel = document.createElement('div'); panel.className = 'tab-menu';
    const loose = section.items.filter((item) => !item.children);
    const columns = [...(loose.length ? [{ label: 'Popular', children: loose }] : []), ...section.items.filter((item) => item.children)];
    panel.style.setProperty('--cols', Math.min(columns.length, 4));
    const seen = new Set();
    panel.append(...columns.map((column) => {
      const col = document.createElement('div'); col.className = 'drop-col';
      const h = document.createElement('h4'); h.textContent = column.label;
      col.append(h, ...column.children.filter((leaf) => !seen.has(leaf.href) && seen.add(leaf.href)).map(dropLink));
      return col;
    }).filter((col) => col.children.length > 1));
    const all = document.createElement('a'); all.href = '#' + section.id; all.className = 'drop-all'; all.textContent = 'Open the ' + section.title + ' dial →';
    panel.append(all);
    tab.append(link, panel);
    // Close the drop-down once something in it is picked.
    panel.addEventListener('click', (event) => { if (event.target.closest('a')) { tab.classList.add('closed'); setTimeout(() => tab.classList.remove('closed'), 400); document.activeElement?.blur(); } });
    return tab;
  }));
}
