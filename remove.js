const fs = require('fs-extra');
const path = require('path');
const glob = require('glob');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

// 配置：扫描哪些文件（根据你的项目调整）
const FILE_PATTERNS = [
  'src/**/*.{js,jsx,ts,tsx}',
  '!src/**/*.d.ts',        // 排除类型声明文件
  '!node_modules/**',
  '!dist/**',
  '!build/**'
];

const OUTPUT_DIR = './output_clean';          // 清理后的代码输出目录
const EXTRACT_FILE = './chinese-texts.json';  // 提取的中文文本汇总

// 中文字符正则（包含基本汉字和扩展区）
const CHINESE_REGEX = /[\u4e00-\u9fa5\u3400-\u4DBF\uF900-\uFAFF]/;

// 工具：判断字符串是否含中文
function hasChinese(text) {
  return CHINESE_REGEX.test(text);
}

// 工具：从字符串中提取所有中文（去重）
function extractChineseChars(text) {
  const matches = text.match(/[\u4e00-\u9fa5\u3400-\u4DBF\uF900-\uFAFF]+/g);
  if (!matches) return [];
  return [...new Set(matches)];
}

// 核心处理函数
function processFile(filePath, outputRoot) {
  console.log(`Processing: ${filePath}`);
  const code = fs.readFileSync(filePath, 'utf-8');

  // 解析AST，支持TypeScript、JSX、装饰器等
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
    errorRecovery: true, // 遇到语法错误时尽量恢复
  });

  // 收集器
  const collector = {
    strings: new Set(),    // 字符串/模板中的中文
    identifiers: new Set() // 变量名/标识符中的中文
  };

  // 遍历AST
  traverse(ast, {
    enter(path) {
      // ----- 1. 删除所有包含中文的注释（包括前后注释） -----
      const node = path.node;
      
      // 处理前导注释
      if (node.leadingComments) {
        node.leadingComments = node.leadingComments.filter(
          comment => !hasChinese(comment.value)
        );
        if (node.leadingComments.length === 0) {
          delete node.leadingComments;
        }
      }
      
      // 处理后置注释
      if (node.trailingComments) {
        node.trailingComments = node.trailingComments.filter(
          comment => !hasChinese(comment.value)
        );
        if (node.trailingComments.length === 0) {
          delete node.trailingComments;
        }
      }
      
      // 处理内部注释（如JSX表达式内）
      if (node.innerComments) {
        node.innerComments = node.innerComments.filter(
          comment => !hasChinese(comment.value)
        );
        if (node.innerComments.length === 0) {
          delete node.innerComments;
        }
      }

      // ----- 2. 提取中文文本（分类） -----
      
      // 2.1 标识符（变量名、函数名、对象Key等）
      if (t.isIdentifier(node)) {
        const name = node.name;
        if (hasChinese(name)) {
          // 提取整个变量名中的中文片段
          const chineseParts = extractChineseChars(name);
          chineseParts.forEach(part => collector.identifiers.add(part));
        }
      }

      // 2.2 字符串字面量
      if (t.isStringLiteral(node)) {
        const value = node.value;
        if (hasChinese(value)) {
          const chineseParts = extractChineseChars(value);
          chineseParts.forEach(part => collector.strings.add(part));
        }
      }

      // 2.3 模板字符串
      if (t.isTemplateLiteral(node)) {
        // 处理静态部分（quasis）
        node.quasis.forEach(quasi => {
          const value = quasi.value.raw;
          if (hasChinese(value)) {
            const chineseParts = extractChineseChars(value);
            chineseParts.forEach(part => collector.strings.add(part));
          }
        });
        // 动态部分（expressions）里的标识符会被上面的Identifier捕获
      }

      // 2.4 JSX文本 (例如: <div>中文内容</div>)
      if (t.isJSXText(node)) {
        const value = node.value;
        if (hasChinese(value)) {
          const chineseParts = extractChineseChars(value);
          chineseParts.forEach(part => collector.strings.add(part));
        }
      }

      // 2.5 JSX属性值（字符串形式）
      if (t.isJSXAttribute(node)) {
        const val = node.value;
        if (t.isStringLiteral(val)) {
          const value = val.value;
          if (hasChinese(value)) {
            const chineseParts = extractChineseChars(value);
            chineseParts.forEach(part => collector.strings.add(part));
          }
        }
      }
    }
  });

  // 生成新代码（comments保留，因为我们只删除了包含中文的注释）
  const output = generate(ast, {
    retainLines: true,    // 保持原行号不变
    comments: true,       // 保留未被删除的注释
    compact: false,
    concise: false
  });

  // 写入清理后的文件（保持目录结构）
  const relativePath = path.relative(process.cwd(), filePath);
  const outPath = path.join(outputRoot, relativePath);
  fs.ensureDirSync(path.dirname(outPath));
  fs.writeFileSync(outPath, output.code, 'utf-8');

  return collector;
}

// 主函数
async function main() {
  // 1. 清空/创建输出目录
  await fs.emptyDir(OUTPUT_DIR);

  // 2. 获取所有匹配的文件
  const files = glob.sync(FILE_PATTERNS, { absolute: true });
  console.log(`Found ${files.length} files to process.`);

  // 3. 合并所有收集结果
  const globalCollector = {
    strings: new Set(),
    identifiers: new Set()
  };

  for (const file of files) {
    try {
      const result = processFile(file, OUTPUT_DIR);
      // 合并
      result.strings.forEach(item => globalCollector.strings.add(item));
      result.identifiers.forEach(item => globalCollector.identifiers.add(item));
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }

  // 4. 导出中文文本（去重后）
  const outputData = {
    total_unique_strings: globalCollector.strings.size,
    total_unique_identifiers: globalCollector.identifiers.size,
    all_unique_combined: [...new Set([...globalCollector.strings, ...globalCollector.identifiers])],
    details: {
      strings: [...globalCollector.strings].sort(),
      identifiers: [...globalCollector.identifiers].sort()
    }
  };

  fs.writeFileSync(EXTRACT_FILE, JSON.stringify(outputData, null, 2), 'utf-8');

  console.log(`\n✅ 处理完成！`);
  console.log(`📁 清理后的代码在: ${OUTPUT_DIR}`);
  console.log(`📄 中文文本汇总在: ${EXTRACT_FILE}`);
  console.log(`   - 字符串中的中文: ${globalCollector.strings.size} 个`);
  console.log(`   - 变量名中的中文: ${globalCollector.identifiers.size} 个`);
  console.log(`   - 总计(去重): ${outputData.all_unique_combined.length} 个`);
}

main().catch(console.error);