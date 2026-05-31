import streamlit as st
import pandas as pd
import tempfile
import os
from type_inference import (
    TypeInferenceEngine, ColumnTypeInfo, SUPPORTED_TYPES,
    TypeDriftAlert, BatchProcessingResult, DEFAULT_BATCH_SIZE
)

st.set_page_config(
    page_title="CSV 智能导入工具",
    page_icon="📊",
    layout="wide",
    initial_sidebar_state="expanded"
)

st.title("📊 CSV 智能导入工具")
st.markdown("基于 DuckDB 的列类型自动推断、增量学习与类型漂移检测")

if "engine" not in st.session_state:
    st.session_state.engine = None
if "column_info_list" not in st.session_state:
    st.session_state.column_info_list = None
if "df_sample" not in st.session_state:
    st.session_state.df_sample = None
if "uploaded_file_path" not in st.session_state:
    st.session_state.uploaded_file_path = None
if "table_created" not in st.session_state:
    st.session_state.table_created = False
if "incremental_mode" not in st.session_state:
    st.session_state.incremental_mode = False
if "incremental_alerts" not in st.session_state:
    st.session_state.incremental_alerts = []
if "incremental_summary" not in st.session_state:
    st.session_state.incremental_summary = None
if "processing_log" not in st.session_state:
    st.session_state.processing_log = []

with st.sidebar:
    st.header("⚙️ 配置")
    
    st.subheader("分析模式")
    mode = st.radio(
        "分析模式",
        ["快速样本分析", "增量类型学习"],
        index=0,
        help="增量模式：每处理 10 万行重新评估类型，检测类型漂移"
    )
    st.session_state.incremental_mode = (mode == "增量类型学习")
    
    if st.session_state.incremental_mode:
        batch_size = st.number_input(
            "批次大小（行）",
            min_value=1000,
            max_value=1000000,
            value=DEFAULT_BATCH_SIZE,
            step=10000,
            help="每多少行重新评估一次列类型"
        )
    else:
        sample_size = st.slider(
            "样本行数",
            min_value=100,
            max_value=5000,
            value=1000,
            step=100,
            help="用于类型推断的采样行数"
        )
    
    st.divider()
    st.markdown("**支持的类型：**")
    for t in SUPPORTED_TYPES:
        st.markdown(f"- `{t}`")

st.header("📁 上传 CSV 文件")

uploaded_file = st.file_uploader("选择 CSV 文件", type=["csv", "txt"],
                                 help="文件将以全字符串方式读入，然后自动推断列类型")

if uploaded_file is not None:
    suffix = os.path.splitext(uploaded_file.name)[1] or ".csv"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(uploaded_file.getbuffer())
        tmp_path = tmp.name

    if st.session_state.uploaded_file_path != tmp_path:
        st.session_state.uploaded_file_path = tmp_path
        st.session_state.table_created = False
        st.session_state.incremental_alerts = []
        st.session_state.processing_log = []
        st.session_state.incremental_summary = None

        if st.session_state.incremental_mode:
            engine = TypeInferenceEngine(batch_size=batch_size)
            st.session_state.engine = engine

            progress_bar = st.progress(0, text="准备增量分析...")
            status_text = st.empty()

            def progress_callback(batch_num, rows_processed, total_rows, alerts_count, schema_update_needed):
                progress = min(rows_processed / total_rows, 1.0)
                msg = f"批次 {batch_num}: 已处理 {rows_processed:,} / {total_rows:,} 行"
                if alerts_count > 0:
                    msg += f" - 发现 {alerts_count} 个报警"
                if schema_update_needed:
                    msg += " ⚠️ 建议更新 Schema"
                progress_bar.progress(progress, text=msg)
                status_text.text(msg)
                st.session_state.processing_log.append({
                    "batch": batch_num,
                    "rows": rows_processed,
                    "alerts": alerts_count,
                    "schema_update": schema_update_needed
                })

            with st.spinner("🔍 正在进行增量类型分析..."):
                column_info_list, alerts = engine.process_incremental(tmp_path, progress_callback)
                st.session_state.column_info_list = column_info_list
                st.session_state.incremental_alerts = alerts
                st.session_state.incremental_summary = engine.get_incremental_summary()
                st.session_state.df_sample = engine.con.execute(
                    "SELECT * FROM temp_data LIMIT 100"
                ).fetchdf()

            progress_bar.empty()
            status_text.empty()

            summary = st.session_state.incremental_summary
            st.success(
                f"✅ 增量分析完成：共 {summary['total_rows_processed']:,} 行，"
                f"{summary['total_batches']} 个批次，"
                f"发现 {summary['total_alerts']} 个报警"
                f"（{summary['high_alerts']} 个高危，{summary['medium_alerts']} 个中危）"
            )

            if summary["schema_update_needed"]:
                st.warning(
                    "⚠️ 检测到类型漂移，建议在下方检查报警信息后更新 Schema 定义"
                )
        else:
            with st.spinner("🔍 正在分析 CSV 文件..."):
                engine = TypeInferenceEngine(sample_size=sample_size)
                column_info_list, df_sample = engine.infer_types(tmp_path)
                st.session_state.engine = engine
                st.session_state.column_info_list = column_info_list
                st.session_state.df_sample = df_sample

            st.success(f"✅ 文件已加载：`{uploaded_file.name}` （共 {len(df_sample)} 行样本，{len(column_info_list)} 列）")

if st.session_state.incremental_summary is not None:
    st.divider()
    st.header("📈 增量分析概览")

    summary = st.session_state.incremental_summary
    
    col1, col2, col3, col4, col5 = st.columns(5)
    with col1:
        st.metric("总行数", f"{summary['total_rows_processed']:,}")
    with col2:
        st.metric("总批次", summary["total_batches"])
    with col3:
        st.metric("批次大小", f"{summary['batch_size']:,}")
    with col4:
        st.metric("总报警数", summary["total_alerts"], 
                  delta=f"{summary['high_alerts']} 高危",
                  delta_color="inverse")
    with col5:
        st.metric("需 Schema 更新", 
                  "是" if summary["schema_update_needed"] else "否",
                  delta_color="inverse")

    if st.session_state.processing_log:
        with st.expander("📋 批次处理日志", expanded=False):
            log_df = pd.DataFrame(st.session_state.processing_log)
            log_df.columns = ["批次", "已处理行数", "报警数", "建议更新Schema"]
            log_df["建议更新Schema"] = log_df["建议更新Schema"].map({True: "是", False: "否"})
            st.dataframe(log_df, use_container_width=True, hide_index=True)

if st.session_state.incremental_alerts:
    st.divider()
    st.header("🚨 类型漂移报警")

    alerts = st.session_state.incremental_alerts
    
    high_alerts = [a for a in alerts if a.severity == "HIGH"]
    medium_alerts = [a for a in alerts if a.severity == "MEDIUM"]
    low_alerts = [a for a in alerts if a.severity == "LOW"]

    alert_tabs = st.tabs([
        f"🔴 高危 ({len(high_alerts)})",
        f"🟡 中危 ({len(medium_alerts)})",
        f"🟢 低危 ({len(low_alerts)})"
    ])

    for tab, alert_list in zip(alert_tabs, [high_alerts, medium_alerts, low_alerts]):
        with tab:
            if not alert_list:
                st.info("暂无此级别的报警")
                continue
            
            for alert in alert_list:
                change_str = ", ".join(
                    f"{k}: {'+' if v > 0 else ''}{v}" for k, v in alert.type_counts_change.items()
                )
                with st.expander(
                    f"[{alert.severity}] 列 `{alert.column_name}`: {alert.previous_type} → {alert.new_type}",
                    expanded=(alert.severity == "HIGH")
                ):
                    st.markdown(f"**批次：** {alert.batch_number}（第 {alert.rows_processed:,} 行）")
                    st.markdown(f"**类型变化：** `{alert.previous_type}` → `{alert.new_type}`")
                    st.markdown(
                        f"**置信度变化：** {alert.previous_confidence:.1%} → {alert.new_confidence:.1%}"
                    )
                    st.markdown(f"**类型分布变化：** {change_str}")
                    st.markdown(f"**建议：** {alert.recommendation}")
                    
                    col_a, col_b = st.columns(2)
                    with col_a:
                        if st.button(
                            f"✅ 应用建议：改为 {alert.new_type}",
                            key=f"apply_alert_{alert.column_name}_{alert.batch_number}",
                            use_container_width=True
                        ):
                            for info in st.session_state.column_info_list:
                                if info.column_name == alert.column_name:
                                    info.override_type = alert.new_type
                                    st.success(f"已将列 `{alert.column_name}` 类型设置为 {alert.new_type}")
                                    break
                    with col_b:
                        if st.button(
                            f"🔍 查看列详情",
                            key=f"view_col_{alert.column_name}_{alert.batch_number}",
                            use_container_width=True
                        ):
                            st.session_state["scroll_to_column"] = alert.column_name

if st.session_state.column_info_list is not None:
    engine: TypeInferenceEngine = st.session_state.engine
    column_info_list: list[ColumnTypeInfo] = st.session_state.column_info_list
    df_sample: pd.DataFrame = st.session_state.df_sample

    st.divider()
    st.header("🔍 类型推断结果")

    display_data = []
    for info in column_info_list:
        type_counts_str = ", ".join(
            f"{k}: {v}" for k, v in info.type_counts.items() if v > 0
        )
        sample_str = ", ".join(str(v) for v in info.sample_values[:5])
        
        has_alert = any(
            a.column_name == info.column_name for a in st.session_state.incremental_alerts
        )
        
        history_str = ""
        if info.historical_types:
            history_str = " → ".join(
                f"{t} ({c:.0%})" for _, t, c in info.historical_types
            ) + f" → {info.inferred_type}"

        display_data.append({
            "列名": info.column_name,
            "推断类型": info.inferred_type,
            "覆盖类型": info.override_type if info.override_type else "-",
            "置信度": info.confidence,
            "混合类型": "⚠️ 是" if info.mixed_type else "否",
            "有报警": "🚨 是" if has_alert else "否",
            "类型历史": history_str,
            "类型分布": type_counts_str,
            "样例值": sample_str,
        })

    st.dataframe(
        pd.DataFrame(display_data),
        use_container_width=True,
        hide_index=True,
        column_config={
            "置信度": st.column_config.ProgressColumn(
                "置信度",
                format="%.0f%%",
                min_value=0,
                max_value=1,
            ),
            "混合类型": st.column_config.TextColumn("混合类型"),
            "有报警": st.column_config.TextColumn("有报警"),
        }
    )

    st.divider()
    st.header("✏️ 手动覆盖类型")

    st.markdown("调整每列的最终类型，然后点击 **应用类型** 生成数据表：")

    override_map = {}
    cols = st.columns(2)
    for idx, info in enumerate(column_info_list):
        has_alert = any(
            a.column_name == info.column_name for a in st.session_state.incremental_alerts
        )
        with cols[idx % 2]:
            label = f"`{info.column_name}`"
            if info.mixed_type:
                label += "  ⚠️"
            if has_alert:
                label += "  🚨"
            
            current = info.override_type or info.inferred_type
            help_text = f"原始推断: {info.inferred_type}（置信度 {info.confidence:.1%}）"
            if info.historical_types:
                history = " → ".join(f"{t} ({c:.0%})" for _, t, c in info.historical_types)
                help_text += f"\n类型历史: {history}"
            
            override = st.selectbox(
                label,
                options=SUPPORTED_TYPES,
                index=SUPPORTED_TYPES.index(current) if current in SUPPORTED_TYPES else 3,
                key=f"override_{info.column_name}",
                help=help_text,
            )
            override_map[info.column_name] = override

    col_btn1, col_btn2, col_btn3 = st.columns([1, 1, 3])

    with col_btn1:
        if st.button("🔄 重置为推断值", use_container_width=True):
            for info in column_info_list:
                info.override_type = None
            st.rerun()

    with col_btn2:
        if st.button("✅ 应用类型", type="primary", use_container_width=True):
            with st.spinner("正在转换类型并创建数据表..."):
                for info in column_info_list:
                    info.override_type = override_map[info.column_name]
                try:
                    df_typed = engine.create_typed_table(
                        st.session_state.uploaded_file_path,
                        column_info_list,
                    )
                    st.session_state.table_created = True
                    st.success("🎉 数据表已创建！")
                except Exception as e:
                    st.error(f"创建数据表失败: {e}")

    if st.session_state.table_created:
        st.divider()
        st.header("📋 数据表预览")

        schema_df = engine.get_table_schema()
        st.markdown("**数据类型定义：**")
        st.dataframe(schema_df[["column_name", "column_type"]], use_container_width=True, hide_index=True)

        st.markdown("**前 100 行数据：**")
        df_typed = engine.con.execute("SELECT * FROM imported_data LIMIT 100").fetchdf()
        st.dataframe(df_typed, use_container_width=True, hide_index=True)

        st.divider()
        st.header("💾 导出数据")

        export_format = st.radio("导出格式", ["Parquet", "CSV"], horizontal=True)
        export_name = st.text_input("导出文件名（不含扩展名）", value="exported_data")

        if st.button("📥 下载导出文件", type="primary"):
            with tempfile.NamedTemporaryFile(delete=False, suffix=f".{export_format.lower()}") as tmp:
                export_path = tmp.name

            try:
                if export_format == "Parquet":
                    engine.export_to_parquet("imported_data", export_path)
                    mime = "application/octet-stream"
                else:
                    engine.export_to_csv("imported_data", export_path)
                    mime = "text/csv"

                with open(export_path, "rb") as f:
                    st.download_button(
                        label=f"⬇️ 下载 {export_name}.{export_format.lower()}",
                        data=f.read(),
                        file_name=f"{export_name}.{export_format.lower()}",
                        mime=mime,
                        use_container_width=True,
                    )
                os.unlink(export_path)
            except Exception as e:
                st.error(f"导出失败: {e}")

    with st.expander("📊 原始样本数据（未类型转换）", expanded=False):
        st.dataframe(df_sample, use_container_width=True, hide_index=True)

else:
    st.info("👈 请先上传一个 CSV 文件开始分析")

st.divider()
st.markdown(
    "**说明：** 本工具使用 DuckDB 作为查询引擎，所有数据处理在本地内存中完成，不会上传到任何服务器。\n\n"
    "**增量学习功能：** 每处理 10 万行重新评估列类型，检测数据类型漂移并自动报警。"
)
