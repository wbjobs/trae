use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tantivy::collector::TopDocs;
use tantivy::query::QueryParser;
use tantivy::schema::*;
use tantivy::tokenizer::*;
use tantivy::{doc, Index, IndexWriter, ReloadPolicy, TantivyDocument};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SearchResult {
    pub path: String,
    pub name: String,
    pub content: String,
    pub score: f32,
}

pub struct SearchEngine {
    index: Index,
    writer: Mutex<IndexWriter>,
    schema: Schema,
    path_field: Field,
    name_field: Field,
    content_field: Field,
}

impl SearchEngine {
    pub fn new(index_path: &str) -> Result<Self> {
        let mut schema_builder = Schema::builder();

        let path_field = schema_builder.add_text_field("path", TEXT | STORED);
        let name_field = schema_builder.add_text_field("name", TEXT | STORED);
        let content_field = schema_builder.add_text_field("content", TEXT | STORED);

        let schema = schema_builder.build();

        let index = Index::open_in_dir(index_path)
            .or_else(|_| Index::create_in_dir(index_path, schema.clone()))
            .context("创建搜索索引失败")?;

        let tokenizer = TextAnalyzer::builder(SimpleTokenizer::default())
            .filter(LowerCaser)
            .filter(RemoveLongFilter::limit(40))
            .build();

        index.tokenizers().register("default", tokenizer);

        let writer = index.writer(50_000_000).context("创建索引写入器失败")?;

        Ok(Self {
            index,
            writer: Mutex::new(writer),
            schema,
            path_field,
            name_field,
            content_field,
        })
    }

    pub fn index_document(&self, path: &str, name: &str, content: &str) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();

        let term = Term::from_field_text(self.path_field, path);
        writer.delete_term(term);

        writer.add_document(doc!(
            self.path_field => path,
            self.name_field => name,
            self.content_field => content,
        ))
        .context("索引文档失败")?;

        writer.commit().context("提交索引失败")?;
        Ok(())
    }

    pub fn search(&self, query: &str, limit: usize) -> Result<Vec<SearchResult>> {
        let reader = self
            .index
            .reader_builder()
            .reload_policy(ReloadPolicy::OnCommit)
            .try_into()
            .context("创建索引读取器失败")?;

        let searcher = reader.searcher();

        let query_parser = QueryParser::for_index(
            &self.index,
            vec![self.path_field, self.name_field, self.content_field],
        );

        let query = query_parser
            .parse_query(query)
            .context("解析搜索查询失败")?;

        let top_docs = searcher
            .search(&query, &TopDocs::with_limit(limit))
            .context("执行搜索失败")?;

        let mut results = Vec::new();
        for (score, doc_address) in top_docs {
            let retrieved_doc: TantivyDocument = searcher
                .doc(doc_address)
                .context("获取文档失败")?;

            let path = retrieved_doc
                .get_first(self.path_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let name = retrieved_doc
                .get_first(self.name_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let content = retrieved_doc
                .get_first(self.content_field)
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();

            let content_preview = if content.len() > 200 {
                format!("{}...", &content[..200])
            } else {
                content
            };

            results.push(SearchResult {
                path,
                name,
                content: content_preview,
                score: score as f32,
            });
        }

        Ok(results)
    }

    pub fn delete_document(&self, path: &str) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        let term = Term::from_field_text(self.path_field, path);
        writer.delete_term(term);
        writer.commit().context("提交删除失败")?;
        Ok(())
    }

    pub fn clear(&self) -> Result<()> {
        let mut writer = self.writer.lock().unwrap();
        writer.delete_all_documents().context("清空索引失败")?;
        writer.commit().context("提交清空失败")?;
        Ok(())
    }
}
