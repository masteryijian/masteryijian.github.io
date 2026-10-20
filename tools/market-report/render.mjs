const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
function inline(value) {
  return escape(value).replace(/&lt;br\s*\/?&gt;/gi,'<br/>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
export function renderMarkdown(text) {
  const lines = text.split('\n'), output = [];
  const cells = line => line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(s=>s.trim());
  for(let i=0;i<lines.length;i++) {
    const line=lines[i];
    if(line.includes('|') && lines[i+1] && /^\s*\|?\s*:?-{3,}/.test(lines[i+1])) {
      output.push('<div class="table-scroll"><table><thead><tr>'+cells(line).map(c=>'<th>'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'); i++;
      while(lines[i+1]?.includes('|')) {i++;output.push('<tr>'+cells(lines[i]).map(c=>'<td>'+inline(c)+'</td>').join('')+'</tr>');}
      output.push('</tbody></table></div>');continue;
    }
    const heading=line.match(/^(#{1,6})\s+(.+)$/);
    if(heading) {const n=heading[1].length;output.push(`<h${n}>${inline(heading[2])}</h${n}>`);}
    else if(/^>\s?/.test(line)) output.push('<blockquote>'+inline(line.replace(/^>\s?/,''))+'</blockquote>');
    else if(/^\s*[-*]\s/.test(line)) output.push('<p class="report-item">• '+inline(line.replace(/^\s*[-*]\s/,''))+'</p>');
    else if(line.trim()) output.push('<p>'+inline(line)+'</p>');
  }
  return output.join('\n');
}
