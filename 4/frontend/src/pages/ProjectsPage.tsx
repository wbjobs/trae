import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectApi } from '@/utils/api';
import type { Project } from '@/types';

const ProjectsPage = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newProject, setNewProject] = useState({ name: '', description: '' });

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const res = await projectApi.list();
      setProjects(res.data);
    } catch (e) {
      console.error('Failed to load projects:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.name.trim()) return;
    try {
      await projectApi.create(newProject);
      setNewProject({ name: '', description: '' });
      setShowCreate(false);
      loadProjects();
    } catch (e) {
      console.error('Failed to create project:', e);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个项目吗？')) return;
    try {
      await projectApi.delete(id);
      loadProjects();
    } catch (e) {
      console.error('Failed to delete project:', e);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>FEA 网格生成与后处理工具</h1>
          <p style={styles.subtitle}>有限元分析 - 几何建模 · 网格划分 · 结果可视化</p>
        </div>
      </header>

      <main style={styles.main}>
        <div style={styles.toolbar}>
          <h2 style={styles.sectionTitle}>我的项目</h2>
          <button
            style={styles.btnPrimary}
            onClick={() => setShowCreate(true)}
          >
            + 新建项目
          </button>
        </div>

        {loading ? (
          <div style={styles.loading}>加载中...</div>
        ) : projects.length === 0 ? (
          <div style={styles.empty}>
            <p style={styles.emptyTitle}>还没有项目</p>
            <p style={styles.emptyDesc}>点击"新建项目"开始创建您的第一个有限元分析项目</p>
            <button
              style={styles.btnPrimary}
              onClick={() => setShowCreate(true)}
            >
              新建项目
            </button>
          </div>
        ) : (
          <div style={styles.projectGrid}>
            {projects.map((project) => (
              <div key={project.id} style={styles.projectCard}>
                <div style={styles.cardHeader} onClick={() => navigate(`/project/${project.id}`)}>
                  <h3 style={styles.cardTitle}>{project.name}</h3>
                  <p style={styles.cardDesc}>
                    {project.description || '暂无描述'}
                  </p>
                </div>
                <div style={styles.cardFooter}>
                  <span style={styles.cardDate}>
                    更新于: {formatDate(project.updated_at)}
                  </span>
                  <button
                    style={styles.btnDanger}
                    onClick={(e) => { e.stopPropagation(); handleDelete(project.id); }}
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {showCreate && (
        <div style={styles.modalOverlay}>
          <div style={styles.modal}>
            <h3 style={styles.modalTitle}>创建新项目</h3>
            <form onSubmit={handleCreate}>
              <div style={styles.formGroup}>
                <label style={styles.label}>项目名称</label>
                <input
                  type="text"
                  style={styles.input}
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  placeholder="输入项目名称"
                  autoFocus
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>描述（可选）</label>
                <textarea
                  style={styles.textarea}
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                  placeholder="输入项目描述"
                  rows={3}
                />
              </div>
              <div style={styles.modalActions}>
                <button
                  type="button"
                  style={styles.btnSecondary}
                  onClick={() => setShowCreate(false)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  style={styles.btnPrimary}
                  disabled={!newProject.name.trim()}
                >
                  创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: Record<string, React.CSSProperties> = {
  container: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%)',
    color: '#e0e6ed',
    overflow: 'auto',
  },
  header: {
    padding: '40px 60px',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: '36px',
    fontWeight: 700,
    margin: 0,
    color: '#fff',
  },
  subtitle: {
    fontSize: '16px',
    color: '#8aa4c4',
    marginTop: '8px',
    margin: 0,
    marginTop: '8px',
  },
  main: {
    padding: '30px 60px',
    maxWidth: '1400px',
    margin: '0 auto',
  },
  toolbar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '24px',
  },
  sectionTitle: {
    fontSize: '24px',
    fontWeight: 600,
    margin: 0,
  },
  btnPrimary: {
    background: '#2196f3',
    color: '#fff',
    border: 'none',
    padding: '10px 24px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: 'rgba(255,255,255,0.1)',
    color: '#e0e6ed',
    border: '1px solid rgba(255,255,255,0.2)',
    padding: '10px 24px',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
  },
  btnDanger: {
    background: 'rgba(244,67,54,0.1)',
    color: '#ef5350',
    border: '1px solid rgba(244,67,54,0.3)',
    padding: '6px 16px',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
  },
  loading: {
    textAlign: 'center',
    padding: '60px',
    color: '#8aa4c4',
  },
  empty: {
    textAlign: 'center',
    padding: '80px',
  },
  emptyTitle: {
    fontSize: '20px',
    color: '#fff',
    margin: 0,
    marginBottom: '8px',
  },
  emptyDesc: {
    color: '#8aa4c4',
    marginBottom: '24px',
  },
  projectGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '20px',
  },
  projectCard: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    overflow: 'hidden',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
  },
  cardHeader: {
    padding: '24px',
  },
  cardTitle: {
    fontSize: '18px',
    fontWeight: 600,
    margin: 0,
    marginBottom: '8px',
    color: '#fff',
  },
  cardDesc: {
    fontSize: '14px',
    color: '#8aa4c4',
    margin: 0,
    lineHeight: 1.5,
  },
  cardFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(0,0,0,0.2)',
  },
  cardDate: {
    fontSize: '12px',
    color: '#6b859e',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1e3a5f',
    borderRadius: '12px',
    padding: '32px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: 600,
    margin: 0,
    marginBottom: '24px',
    color: '#fff',
  },
  formGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    marginBottom: '8px',
    color: '#e0e6ed',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    resize: 'vertical',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '8px',
  },
};

export default ProjectsPage;
