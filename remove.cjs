const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;

// ---------- 配置 ----------
const FILE_PATTERNS = [
  'src/**/*.{js,jsx,ts,tsx}',
  '!src/**/*.d.ts',
  '!node_modules/**',
  '!dist/**',
  '!build/**'
];
const OUTPUT_FILE = './non-english-texts.json';   // 输出结果文件

// 匹配所有非 ASCII 字符（包括中文、日文、韩文、特殊符号等）
const NON_ASCII_REGEX = /[^\x00-\x7F]+/g;

/**
 * 从字符串中提取所有连续的非 ASCII 字符片段，并去重
 */
function extractNonEnglish(text) {
  const matches = text.match(NON_ASCII_REGEX);
  if (!matches) return [];
  return [...new Set(matches)];
}

/**
 * 处理单个文件，收集所有非英文字符串（包括注释）
 */
function processFile(filePath) {
  console.log(`Processing: ${filePath}`);
  const code = fs.readFileSync(filePath, 'utf-8');

  // 解析 AST（启用错误恢复）
  const ast = parser.parse(code, {
    sourceType: 'module',
    plugins: [
      'jsx',
      'typescript',
      'decorators-legacy',
      'classProperties',
      'dynamicImport',
      'optionalChaining',
      'nullishCoalescingOperator'
    ],
    errorRecovery: true,
    // 重要：保留注释，以便后续提取
    attachComment: true
  });

  const collector = new Set();   // 全局去重

  // 遍历 AST
  traverse(ast, {
    enter(path) {
      const node = path.node;

      // ----- 1. 处理节点自身的注释（前导、尾随、内部） -----
      const commentTypes = ['leadingComments', 'trailingComments', 'innerComments'];
      for (const type of commentTypes) {
        const comments = node[type];
        if (Array.isArray(comments)) {
          for (const comment of comments) {
            const value = comment.value;
            const chunks = extractNonEnglish(value);
            chunks.forEach(chunk => collector.add(chunk));
          }
        }
      }

      // ----- 2. 处理各种源代码中的非英文内容 -----

      // 2.1 标识符（变量名、函数名、对象 key）
      if (node.type === 'Identifier') {
        const name = node.name;
        const chunks = extractNonEnglish(name);
        chunks.forEach(chunk => collector.add(chunk));
      }

      // 2.2 字符串字面量
      if (node.type === 'StringLiteral') {
        const value = node.value;
        const chunks = extractNonEnglish(value);
        chunks.forEach(chunk => collector.add(chunk));
      }

      // 2.3 模板字符串的静态部分（quasis）
      if (node.type === 'TemplateLiteral') {
        for (const quasi of node.quasis) {
          const value = quasi.value.raw;
          const chunks = extractNonEnglish(value);
          chunks.forEach(chunk => collector.add(chunk));
        }
      }

      // 2.4 JSX 文本（<div>中文</div>）
      if (node.type === 'JSXText') {
        const value = node.value;
        const chunks = extractNonEnglish(value);
        chunks.forEach(chunk => collector.add(chunk));
      }

      // 2.5 JSX 属性值（<div title="中文" />）
      if (node.type === 'JSXAttribute') {
        const val = node.value;
        if (val && val.type === 'StringLiteral') {
          const value = val.value;
          const chunks = extractNonEnglish(value);
          chunks.forEach(chunk => collector.add(chunk));
        }
      }

      // 2.6 正则表达式（极少包含非英文，但保留）
      if (node.type === 'RegExpLiteral') {
        const value = node.pattern;
        const chunks = extractNonEnglish(value);
        chunks.forEach(chunk => collector.add(chunk));
      }
    }
  });

  return collector;
}

/**
 * 主函数
 */
async function main() {
  // 获取所有文件
  const files = glob.sync(FILE_PATTERNS, { absolute: true });
  console.log(`Found ${files.length} files to process.`);

  const globalCollector = new Set();

  for (const file of files) {
    try {
      const result = processFile(file);
      // 合并
      for (const item of result) {
        globalCollector.add(item);
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }

  // 排序后输出
  const sorted = [...globalCollector].sort();
  const output = {
    total: sorted.length,
    items: sorted
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`\n✅ 提取完成！共找到 ${sorted.length} 个不同的非英文字符串。`);
  console.log(`📄 结果已保存至: ${OUTPUT_FILE}`);
}

main().catch(console.error);