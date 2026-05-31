import pandas as pd
import numpy as np
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
import matplotlib.pyplot as plt
import seaborn as sns
from datetime import datetime, timedelta
import warnings
warnings.filterwarnings('ignore')

from config.config import VISUALIZATION_CONFIG


class ChartRenderer:
    def __init__(self):
        self.colors = VISUALIZATION_CONFIG['chart_colors']
        self.bg_color = VISUALIZATION_CONFIG['background_color']
        self.text_color = VISUALIZATION_CONFIG['text_color']

    def create_line_chart(self, df, x_col, y_col, title='', x_title='', y_title=''):
        fig = go.Figure()
        
        if isinstance(y_col, list):
            for i, col in enumerate(y_col):
                fig.add_trace(go.Scatter(
                    x=df[x_col],
                    y=df[col],
                    mode='lines+markers',
                    name=col,
                    line=dict(color=self.colors[i % len(self.colors)], width=2)
                ))
        else:
            fig.add_trace(go.Scatter(
                x=df[x_col],
                y=df[y_col],
                mode='lines+markers',
                name=y_col,
                line=dict(color=self.colors[0], width=2)
            ))
        
        fig.update_layout(
            title=title,
            xaxis_title=x_title,
            yaxis_title=y_title,
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color),
            xaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
            yaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
            legend=dict(bgcolor=self.bg_color)
        )
        
        return fig

    def create_bar_chart(self, df, x_col, y_col, title='', x_title='', y_title='', orientation='v'):
        fig = go.Figure()
        
        if isinstance(y_col, list):
            for i, col in enumerate(y_col):
                fig.add_trace(go.Bar(
                    x=df[x_col],
                    y=df[col],
                    name=col,
                    marker_color=self.colors[i % len(self.colors)],
                    orientation=orientation
                ))
        else:
            fig.add_trace(go.Bar(
                x=df[x_col],
                y=df[y_col],
                name=y_col,
                marker_color=self.colors[0]
            ))
        
        fig.update_layout(
            title=title,
            xaxis_title=x_title,
            yaxis_title=y_title,
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color),
            xaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
            yaxis=dict(gridcolor='rgba(255,255,255,0.1)'),
            legend=dict(bgcolor=self.bg_color)
        )
        
        return fig

    def create_pie_chart(self, df, labels_col, values_col, title=''):
        fig = go.Figure(data=[go.Pie(
            labels=df[labels_col],
            values=df[values_col],
            hole=0.4,
            marker=dict(colors=self.colors)
        )])
        
        fig.update_layout(
            title=title,
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color),
            legend=dict(bgcolor=self.bg_color)
        )
        
        return fig

    def create_gauge_chart(self, value, min_val, max_val, title='', units=''):
        fig = go.Figure(go.Indicator(
            mode="gauge+number",
            value=value,
            domain={'x': [0, 1], 'y': [0, 1]},
            title={'text': title, 'font': {'color': self.text_color}},
            gauge={
                'axis': {'range': [min_val, max_val], 'tickcolor': self.text_color},
                'bar': {'color': self.colors[0]},
                'steps': [
                    {'range': [min_val, max_val * 0.6], 'color': 'rgba(76, 175, 80, 0.7)'},
                    {'range': [max_val * 0.6, max_val * 0.85], 'color': 'rgba(255, 193, 7, 0.7)'},
                    {'range': [max_val * 0.85, max_val], 'color': 'rgba(244, 67, 54, 0.7)'}
                ],
                'threshold': {
                    'line': {'color': "red", 'width': 4},
                    'thickness': 0.75,
                    'value': max_val * 0.9
                }
            },
            number={'font': {'color': self.text_color, 'suffix': units}}
        ))
        
        fig.update_layout(
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
        )
        
        return fig

    def create_heatmap(self, df, x_col, y_col, value_col, title=''):
        pivot_df = df.pivot(index=y_col, columns=x_col, values=value_col)
        
        fig = go.Figure(data=go.Heatmap(
            z=pivot_df.values,
            x=pivot_df.columns,
            y=pivot_df.index,
            colorscale='Viridis',
            hoverongaps=False
        ))
        
        fig.update_layout(
            title=title,
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color)
        )
        
        return fig

    def create_scatter_chart(self, df, x_col, y_col, color_col=None, size_col=None, title=''):
        fig = px.scatter(
            df,
            x=x_col,
            y=y_col,
            color=color_col,
            size=size_col,
            title=title,
            color_continuous_scale='Viridis'
        )
        
        fig.update_layout(
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color)
        )
        
        return fig

    def create_area_chart(self, df, x_col, y_col, title=''):
        fig = go.Figure()
        
        if isinstance(y_col, list):
            for i, col in enumerate(y_col):
                fig.add_trace(go.Scatter(
                    x=df[x_col],
                    y=df[col],
                    mode='lines',
                    stackgroup='one',
                    name=col,
                    line=dict(width=0.5, color=self.colors[i % len(self.colors)])
                ))
        else:
            fig.add_trace(go.Scatter(
                x=df[x_col],
                y=df[y_col],
                mode='lines',
                stackgroup='one',
                name=y_col,
                line=dict(width=0.5, color=self.colors[0])
            ))
        
        fig.update_layout(
            title=title,
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color)
        )
        
        return fig

    def create_treemap(self, df, path_cols, value_col, title=''):
        fig = px.treemap(
            df,
            path=path_cols,
            values=value_col,
            title=title,
            color_discrete_sequence=self.colors
        )
        
        fig.update_layout(
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color)
        )
        
        return fig

    def create_anomaly_scatter(self, df, x_col, y_col, anomaly_col='is_anomaly', title=''):
        fig = go.Figure()
        
        normal = df[df[anomaly_col] == 0]
        anomaly = df[df[anomaly_col] == 1]
        
        fig.add_trace(go.Scatter(
            x=normal[x_col],
            y=normal[y_col],
            mode='markers',
            name='正常',
            marker=dict(color=self.colors[2], size=8, opacity=0.6)
        ))
        
        fig.add_trace(go.Scatter(
            x=anomaly[x_col],
            y=anomaly[y_col],
            mode='markers',
            name='异常',
            marker=dict(color='red', size=10, symbol='x')
        ))
        
        fig.update_layout(
            title=title,
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            font=dict(color=self.text_color),
            legend=dict(bgcolor=self.bg_color)
        )
        
        return fig

    def create_kpi_card(self, title, value, subtitle='', delta=None, delta_color='green'):
        fig = go.Figure()
        
        fig.add_annotation(
            x=0.5,
            y=0.8,
            text=title,
            showarrow=False,
            font=dict(size=14, color=self.text_color)
        )
        
        fig.add_annotation(
            x=0.5,
            y=0.5,
            text=str(value),
            showarrow=False,
            font=dict(size=36, color=self.colors[1])
        )
        
        if subtitle:
            fig.add_annotation(
                x=0.5,
                y=0.2,
                text=subtitle,
                showarrow=False,
                font=dict(size=12, color=self.text_color)
            )
        
        if delta:
            delta_text = f"{delta}"
            fig.add_annotation(
                x=0.5,
                y=0.05,
                text=delta_text,
                showarrow=False,
                font=dict(size=14, color=delta_color)
            )
        
        fig.update_layout(
            plot_bgcolor=self.bg_color,
            paper_bgcolor=self.bg_color,
            xaxis=dict(showgrid=False, zeroline=False, showticklabels=False),
            yaxis=dict(showgrid=False, zeroline=False, showticklabels=False)
        )
        
        return fig
