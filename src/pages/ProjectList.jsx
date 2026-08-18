import React, { useState, useEffect } from 'react';
import { Search, Plus, Edit2, Trash2, X, Upload, Download } from 'lucide-react';
import './ProjectList.css'; // Basic CSS for specific elements if needed

const ProjectList = () => {
  const [projects, setProjects] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    project_no: '',
    customer_name: '',
    customer_contact: '',
    name: '',
    start_date: '',
    end_date: '',
    remarks: '',
    status: 'IN_PROGRESS',
    documents: []
  });

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchProjects();
    const fetchCustomers = async () => {
      const res = await window.electronAPI.namedQuery('fetchCustomers');
      if (res.success) {
        setCustomers(res.rows);
      }
    };
    fetchCustomers();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await window.electronAPI.namedQuery('fetchProjects');
      if (res.success) {
        setProjects(res.rows);
      }
    } catch (error) {
      console.error('Failed to fetch projects', error);
    }
  };

  const handleOpenModal = (proj = null) => {
    if (proj) {
      setEditingId(proj.id);
      setFormData({
        project_no: proj.project_no || '',
        customer_name: proj.customer_name || '',
        customer_contact: proj.customer_contact || '',
        name: proj.name || '',
        start_date: proj.start_date ? proj.start_date.split('T')[0] : '',
        end_date: proj.end_date ? proj.end_date.split('T')[0] : '',
        remarks: proj.remarks || '',
        status: proj.status || 'IN_PROGRESS',
        documents: proj.documents || []
      });
    } else {
      setEditingId(null);
      
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, '0');
      const dd = String(today.getDate()).padStart(2, '0');
      const prefix = `PRJ-${yyyy}${mm}${dd}-`;

      const existingSuffixes = projects
        .filter(p => p.project_no && p.project_no.startsWith(prefix))
        .map(p => parseInt(p.project_no.replace(prefix, ''), 10))
        .filter(n => !isNaN(n))
        .sort((a, b) => a - b);

      let nextNum = 1;
      for (let num of existingSuffixes) {
        if (num === nextNum) {
          nextNum++;
        } else if (num > nextNum) {
          break;
        }
      }
      
      const newNo = prefix + String(nextNum).padStart(2, '0');

      setFormData({
        project_no: newNo,
        customer_name: '',
        customer_contact: '',
        name: '',
        start_date: '',
        end_date: '',
        remarks: '',
        status: 'IN_PROGRESS',
        documents: []
      });
    }
    setShowModal(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await window.electronAPI.namedQuery('updateProject', [
          formData.customer_name,
          formData.customer_contact,
          formData.name,
          formData.start_date || null,
          formData.end_date || null,
          formData.remarks,
          formData.status,
          JSON.stringify(formData.documents),
          editingId
        ]);
      } else {
        await window.electronAPI.namedQuery('createProject', [
          formData.project_no,
          formData.customer_name,
          formData.customer_contact,
          formData.name,
          formData.start_date || null,
          formData.end_date || null,
          formData.remarks,
          formData.status
        ]);
      }
      setShowModal(false);
      fetchProjects();
    } catch (error) {
      console.error('Save failed', error);
      alert('儲存失敗，專案名稱可能已存在。');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('確定要刪除這個專案嗎？')) {
      try {
        await window.electronAPI.namedQuery('deleteProject', [id]);
        fetchProjects();
      } catch (error) {
        console.error('Delete failed', error);
      }
    }
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const data = new FormData();
    data.append('projectName', formData.project_no);
    data.append('file', file);
    
    setUploading(true);
    try {
      const response = await fetch('http://localhost:3000/api/upload', {
        method: 'POST',
        body: data
      });
      const result = await response.json();
      if (result.success) {
        setFormData(prev => ({
          ...prev,
          documents: [...prev.documents, { name: file.name, url: result.url || `/uploads/${result.fileName}` }]
        }));
      } else {
        alert('上傳失敗');
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('上傳發生錯誤');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const removeDocument = (index) => {
    setFormData(prev => {
      const newDocs = [...prev.documents];
      newDocs.splice(index, 1);
      return { ...prev, documents: newDocs };
    });
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) || 
    (p.customer_name && p.customer_name.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const totalPages = Math.ceil(filteredProjects.length / itemsPerPage) || 1;
  const paginatedProjects = filteredProjects.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const navBtnStyle = { padding: '6px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', backgroundColor: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: '600', color: '#475569' };

  return (
    <div className="page-container">
      <div className="page-header">
        <h1>專案列表</h1>
        <div className="header-actions">
          <div className="search-bar">
            <Search size={20} className="search-icon" />
            <input 
              type="text" 
              placeholder="搜尋專案名稱 / 客戶..." 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#64748b' }}>
            顯示
            <select
              value={itemsPerPage}
              onChange={(e) => {
                setItemsPerPage(Number(e.target.value));
                setCurrentPage(1);
              }}
              style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', outline: 'none', backgroundColor: '#fff', cursor: 'pointer' }}
            >
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
            筆/頁
          </div>
          <button className="primary-btn" onClick={() => handleOpenModal()}>
            <Plus size={20} /> 新增專案
          </button>
        </div>
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>專案編號</th>
              <th>專案名稱</th>
              <th>客戶名稱</th>
              <th>聯絡人</th>
              <th>開始時間</th>
              <th>結束時間</th>
              <th>狀態</th>
              <th>備註</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {paginatedProjects.map(proj => (
              <tr key={proj.id}>
                <td>{proj.project_no}</td>
                <td className="font-medium">{proj.name}</td>
                <td>{proj.customer_name}</td>
                <td>{proj.customer_contact || '-'}</td>
                <td>{proj.start_date ? new Date(proj.start_date).toLocaleDateString() : '-'}</td>
                <td>{proj.end_date ? new Date(proj.end_date).toLocaleDateString() : '-'}</td>
                <td>
                  <span className={`status-badge ${proj.status === 'IN_PROGRESS' ? 'active' : 'inactive'}`}>
                    {proj.status === 'IN_PROGRESS' ? '進行中' : '已結案'}
                  </span>
                </td>
                <td>{proj.remarks}</td>
                <td>
                  <div className="action-buttons">
                    <button className="icon-btn edit" onClick={() => handleOpenModal(proj)} title="編輯">
                      <Edit2 size={18} />
                    </button>
                    <button className="icon-btn delete" onClick={() => handleDelete(proj.id)} title="刪除">
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filteredProjects.length === 0 && (
              <tr>
                <td colSpan="7" className="text-center empty-state">找不到符合的專案</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', padding: '20px', backgroundColor: '#fff', borderRadius: '16px', marginTop: '16px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
          <button disabled={currentPage === 1} onClick={() => setCurrentPage(prev => prev - 1)} style={{ ...navBtnStyle, opacity: currentPage === 1 ? 0.5 : 1 }}>上一頁</button>
          <span style={{ display: 'flex', alignItems: 'center', fontWeight: '800', color: '#475569', fontSize: '13px' }}>第 {currentPage} 頁 / 共 {totalPages} 頁</span>
          <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(prev => prev + 1)} style={{ ...navBtnStyle, opacity: currentPage === totalPages ? 0.5 : 1 }}>下一頁</button>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h2>{editingId ? '編輯專案' : '新增專案'}</h2>
              <button className="close-btn" onClick={() => setShowModal(false)}><X size={24} /></button>
            </div>
            <form onSubmit={handleSave} className="modal-body form-grid">
              <div className="form-group">
                <label>客戶名稱 (聯絡人)</label>
                <select 
                  value={formData.customer_name ? `${formData.customer_name}|||${formData.customer_contact || ''}` : ''} 
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) {
                      setFormData({...formData, customer_name: '', customer_contact: ''});
                    } else {
                      const [cName, cContact] = val.split('|||');
                      setFormData({...formData, customer_name: cName, customer_contact: cContact});
                    }
                  }}
                >
                  <option value="">--請選擇客戶--</option>
                  {customers.map((c, i) => (
                    <option key={i} value={`${c.name}|||${c.contact || ''}`}>
                      {c.name} {c.contact ? `(${c.contact})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>專案名稱 *</label>
                <input 
                  type="text" 
                  required
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>專案開始時間</label>
                <input 
                  type="date" 
                  value={formData.start_date} 
                  onChange={e => setFormData({...formData, start_date: e.target.value})}
                />
              </div>
              <div className="form-group">
                <label>專案結束時間</label>
                <input 
                  type="date" 
                  value={formData.end_date} 
                  onChange={e => setFormData({...formData, end_date: e.target.value})}
                />
              </div>
              <div className="form-group full-width">
                <label>狀態</label>
                <select 
                  value={formData.status} 
                  onChange={e => setFormData({...formData, status: e.target.value})}
                >
                  <option value="IN_PROGRESS">進行中</option>
                  <option value="CLOSED">已結案</option>
                </select>
              </div>
              <div className="form-group full-width">
                <label>備註</label>
                <textarea 
                  rows="3"
                  value={formData.remarks} 
                  onChange={e => setFormData({...formData, remarks: e.target.value})}
                />
              </div>
              
              {editingId && (
                <div className="form-group full-width document-section">
                  <label>專案文件</label>
                  <div className="document-upload">
                    <input 
                      type="file" 
                      id="file-upload" 
                      className="hidden-file-input" 
                      onChange={handleFileUpload} 
                      disabled={uploading}
                      style={{ display: 'none' }}
                    />
                    <label htmlFor="file-upload" className="upload-btn" style={{ cursor: 'pointer', padding: '8px 12px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: '4px', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      <Upload size={16} /> {uploading ? '上傳中...' : '上傳檔案'}
                    </label>
                  </div>
                  <ul className="document-list" style={{ marginTop: '10px', listStyle: 'none', padding: 0 }}>
                    {formData.documents.map((doc, idx) => (
                      <li key={idx} className="document-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px', borderBottom: '1px solid #e2e8f0' }}>
                        <a href={`http://localhost:3000${doc.url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', textDecoration: 'none' }}>
                          {doc.name}
                        </a>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <a 
                            href={`http://localhost:3000${doc.url}`} 
                            download={doc.name}
                            className="icon-btn edit" 
                            title="下載檔案" 
                            style={{ padding: '4px' }}
                          >
                            <Download size={14} />
                          </a>
                          <button type="button" className="remove-doc-btn" onClick={() => removeDocument(idx)} title="刪除檔案">
                            <X size={14} />
                          </button>
                        </div>
                      </li>
                    ))}
                    {formData.documents.length === 0 && (
                      <li className="empty-docs" style={{ color: '#64748b', fontSize: '0.9em' }}>目前沒有上傳的文件</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="form-actions full-width" style={{ marginTop: '20px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" className="secondary-btn" onClick={() => setShowModal(false)}>取消</button>
                <button type="submit" className="primary-btn">儲存</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectList;
