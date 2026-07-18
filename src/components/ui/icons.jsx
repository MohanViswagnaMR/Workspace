/* =========================================================================
   icons.jsx — Lucide icon registry + default page / file / folder marks
   -------------------------------------------------------------------------
   The Ic wrapper maps short names to lucide-react icons via ICON_MAP; the
   *Mark components are the default icons a node shows when it has no custom
   emoji (extension text for file-backed pages, document outline for smart
   pages, folder outline for folders). FILE_ICON / fileAccentColor pick the
   emoji + accent colour for uploaded files by MIME type. Pure presentation:
   imports nothing from src/ but lucide-react.
   ========================================================================= */
import React from 'react';
import {
  Search, Home, Inbox, Settings, Plus, ChevronRight, ChevronDown,
  FileText, Trash2, MoreHorizontal, Star, LayoutTemplate, GripVertical,
  Check, X, Image, Link, Table, Kanban, LayoutGrid, List, Calendar,
  Filter, ArrowUpDown, Sun, Moon, Menu, ChevronLeft, Maximize2,
  Share2, Users, Archive, Upload, LayoutDashboard, RotateCcw, Download,
  Monitor, CloudCheck, CloudUpload, Key, ExternalLink, Copy, Keyboard,
  Cloud, HardDrive, Paperclip, Database, Eye, PanelRight, PanelLeftClose, LogOut, Unlink,
  Puzzle, Info, FolderPlus, Folder, FolderOpen, Plug,
  Play,
} from 'lucide-react';

/* ---------- Lucide icons ---------- */
const ICON_MAP = {
  search: Search, home: Home, inbox: Inbox, settings: Settings,
  plus: Plus, chevron: ChevronRight, 'chevron-down': ChevronDown,
  doc: FileText, trash: Trash2, dots: MoreHorizontal, star: Star,
  template: LayoutTemplate, grip: GripVertical, drag: GripVertical,
  check: Check, x: X, image: Image, link: Link,
  table: Table, board: Kanban, gallery: LayoutGrid, list: List,
  calendar: Calendar, filter: Filter, sort: ArrowUpDown,
  sun: Sun, moon: Moon, menu: Menu, back: ChevronLeft, fwd: ChevronRight,
  expand: Maximize2, share: Share2, users: Users, archive: Archive,
  import: Upload, dashboard: LayoutDashboard, restore: RotateCcw,
  download: Download, computer: Monitor,
  'cloud-check': CloudCheck, 'cloud-upload': CloudUpload,
  key: Key, 'external-link': ExternalLink, copy: Copy, keyboard: Keyboard,
  cloud: Cloud, 'hard-drive': HardDrive,
  paperclip: Paperclip, database: Database, eye: Eye, 'panel-right': PanelRight,
  'panel-left-close': PanelLeftClose, puzzle: Puzzle, plug: Plug, info: Info, 'folder-plus': FolderPlus,
  folder: Folder, 'folder-open': FolderOpen,
  'log-out': LogOut, unlink: Unlink, play: Play,
};

function Ic({n, style}) {
  const Icon = ICON_MAP[n];
  if (!Icon) return null;
  const {width, height, ...rest} = style || {};
  const sz = +(width || height || 16);
  return <Icon width={sz} height={sz} strokeWidth={1.8}
    {...(Object.keys(rest).length ? {style: rest} : {})}/>;
}

/* Default icon for SIMPLE markdown pages: just the text "md" — plain styled
   text (no SVG box), so at default size it matches the page-title text size. */
/* Text icon for file-backed pages: the extension itself ("md", "py", "txt")
   rendered as the icon — no box, just the letters. */
const EXT_MARK_COLORS={md:'#519aba',py:'#4B8BBE',js:'#e8d44d',jsx:'#61dafb',ts:'#3178c6',
  html:'#e37933',css:'#9575cd',json:'#cbcb41',csv:'#89e051',sh:'#89e051',
  yaml:'#cb4b16',xml:'#e37933',sql:'#c0c0c0',txt:'#9aa0a6'};
function ExtMark({ext='md',size=16}){
  const t=String(ext||'md').toLowerCase().slice(0,4);
  return <span className="md-mark" aria-hidden="true"
    style={{fontSize:Math.round(size*(t.length>2?0.72:0.9)),fontWeight:800,lineHeight:1,
      fontFamily:"ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace",
      letterSpacing:'-0.5px',color:EXT_MARK_COLORS[t]}}>{t}</span>;
}
const MdMark=({size=16})=><ExtMark ext="md" size={size}/>;
/* Default icon for SMART (block) pages: the lucide page/document icon. */
const PageMark=({size=15})=>
  <Ic n="doc" style={{width:size,height:size,color:'var(--text-2)'}}/>;
/* Kind-aware default (used wherever a node has no custom emoji icon):
   smart pages → document icon; file-backed pages → their extension as text
   ("md" for simple md + plugin pages, "py"/"txt"/… for file pages). */
const NodeMark=({node,size=15})=>
  !node?<PageMark size={size}/>
  :node.kind==='md'||node.kind==='plugin'?<ExtMark ext="md" size={size}/>
  :node.kind==='file'?<ExtMark ext={node.ext||'txt'} size={size}/>
  :<PageMark size={size}/>;
/* Default folder icon (simple outline, not an emoji). */
const FolderMark=({open,size=15})=>
  <Ic n={open?'folder-open':'folder'} style={{width:size,height:size,color:'var(--text-2)'}}/>;

/* ---- File icon + accent colour by MIME type ---- */
const FILE_ICON=t=>t?.startsWith('video/')?'🎬':t?.startsWith('audio/')?'🎵'
  :t==='application/pdf'?'📄':t?.startsWith('image/')?'🖼️':t?.startsWith('text/')?'📝':'📎';

const FILE_TYPE_COLOR={
  'image/':'#8b5cf6','video/':'#ec4899','audio/':'#f59e0b',
  'application/pdf':'#ef4444','text/':'#3b82f6',
};
function fileAccentColor(type){
  if(!type) return '#64748b';
  for(const [k,v] of Object.entries(FILE_TYPE_COLOR)) if(type.startsWith(k)) return v;
  return '#64748b';
}

export { ICON_MAP, Ic, EXT_MARK_COLORS, ExtMark, MdMark, PageMark, NodeMark,
  FolderMark, FILE_ICON, FILE_TYPE_COLOR, fileAccentColor };
