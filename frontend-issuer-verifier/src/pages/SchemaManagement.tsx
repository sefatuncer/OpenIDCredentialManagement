import { useState, useEffect } from 'react';
import { Layout } from '../components/Layout';
import { schemaApi } from '../services/api';
import { toast } from '../hooks/useToast';

interface SchemaProperty {
  type: string;
  description?: string;
  required?: boolean;
  enum?: unknown[];
}

interface CredentialSchema {
  id: string;
  name: string;
  version: string;
  type: string;
  description: string;
  required: string[];
  credentialSubject: {
    type: string;
    properties: Record<string, SchemaProperty>;
  };
  issuanceConfig?: {
    validityPeriod?: number;
    revocable?: boolean;
    selectiveDisclosure?: string[];
  };
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

type ViewMode = 'list' | 'create' | 'detail';

export function SchemaManagement() {
  const [schemas, setSchemas] = useState<CredentialSchema[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedSchema, setSelectedSchema] = useState<CredentialSchema | null>(null);

  // Create form state
  const [formId, setFormId] = useState('');
  const [formName, setFormName] = useState('');
  const [formVersion, setFormVersion] = useState('1.0.0');
  const [formType, setFormType] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formSubjectType, setFormSubjectType] = useState('');
  const [formProperties, setFormProperties] = useState('{}');
  const [formRequired, setFormRequired] = useState('');
  const [formSDClaims, setFormSDClaims] = useState('');
  const [formRevocable, setFormRevocable] = useState(true);
  const [formValidityDays, setFormValidityDays] = useState('365');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSchemas();
  }, []);

  const loadSchemas = async () => {
    setIsLoading(true);
    const res = await schemaApi.list();
    if (res.success && res.data) {
      setSchemas(res.data.schemas as CredentialSchema[]);
    }
    setIsLoading(false);
  };

  const handleCreate = async () => {
    let properties: Record<string, unknown>;
    try {
      properties = JSON.parse(formProperties);
    } catch {
      toast.error('Invalid JSON in properties field');
      return;
    }

    setIsSaving(true);
    const res = await schemaApi.create({
      id: formId,
      name: formName,
      version: formVersion,
      type: formType,
      description: formDescription,
      required: formRequired ? formRequired.split(',').map(s => s.trim()) : [],
      credentialSubject: {
        type: formSubjectType || formType,
        properties,
      },
      issuanceConfig: {
        validityPeriod: parseInt(formValidityDays) * 86400,
        revocable: formRevocable,
        selectiveDisclosure: formSDClaims ? formSDClaims.split(',').map(s => s.trim()) : [],
      },
    });
    setIsSaving(false);

    if (res.success) {
      toast.success(`Schema "${formName}" created`);
      resetForm();
      setViewMode('list');
      loadSchemas();
    }
  };

  const handleDeactivate = async (id: string) => {
    const res = await schemaApi.deactivate(id);
    if (res.success) {
      toast.success(`Schema "${id}" deactivated`);
      loadSchemas();
      if (selectedSchema?.id === id) {
        setViewMode('list');
        setSelectedSchema(null);
      }
    }
  };

  const resetForm = () => {
    setFormId('');
    setFormName('');
    setFormVersion('1.0.0');
    setFormType('');
    setFormDescription('');
    setFormSubjectType('');
    setFormProperties('{}');
    setFormRequired('');
    setFormSDClaims('');
    setFormRevocable(true);
    setFormValidityDays('365');
  };

  const viewSchema = (schema: CredentialSchema) => {
    setSelectedSchema(schema);
    setViewMode('detail');
  };

  return (
    <Layout role="issuer">
      <div className="page-header">
        <h1 className="page-title">Credential Schema Registry</h1>
        <p className="page-subtitle">Manage credential type definitions and selective disclosure rules</p>
      </div>

      {viewMode === 'list' && (
        <>
          <div style={{ marginBottom: '1rem' }}>
            <button
              className="btn btn-issuer"
              onClick={() => { resetForm(); setViewMode('create'); }}
            >
              + New Schema
            </button>
          </div>

          {isLoading ? (
            <div className="card"><p>Loading schemas...</p></div>
          ) : schemas.length === 0 ? (
            <div className="card"><p>No schemas found.</p></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {schemas.map((schema) => (
                <div key={schema.id} className="card" style={{ cursor: 'pointer' }} onClick={() => viewSchema(schema)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem' }}>{schema.name}</h3>
                      <p style={{ margin: '0.25rem 0 0', color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>
                        {schema.type} v{schema.version} — {schema.description}
                      </p>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
                        {schema.issuanceConfig?.selectiveDisclosure?.map((claim) => (
                          <span key={claim} style={{
                            fontSize: '0.75rem',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '0.25rem',
                            background: 'var(--color-bg-tertiary)',
                            color: 'var(--color-text-secondary)',
                          }}>
                            SD: {claim}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{
                        fontSize: '0.75rem',
                        padding: '0.15rem 0.5rem',
                        borderRadius: '0.25rem',
                        background: schema.active ? 'var(--color-success)' : 'var(--color-error)',
                        color: 'white',
                      }}>
                        {schema.active ? 'Active' : 'Inactive'}
                      </span>
                      <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.8rem', padding: '0.25rem 0.75rem' }}
                        onClick={(e) => { e.stopPropagation(); handleDeactivate(schema.id); }}
                      >
                        Deactivate
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {viewMode === 'detail' && selectedSchema && (
        <>
          <button className="btn btn-secondary" onClick={() => setViewMode('list')} style={{ marginBottom: '1rem' }}>
            Back to List
          </button>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">{selectedSchema.name}</h3>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <strong>ID:</strong> {selectedSchema.id}
              </div>
              <div>
                <strong>Type:</strong> {selectedSchema.type}
              </div>
              <div>
                <strong>Version:</strong> {selectedSchema.version}
              </div>
              <div>
                <strong>Revocable:</strong> {selectedSchema.issuanceConfig?.revocable ? 'Yes' : 'No'}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong>Description:</strong> {selectedSchema.description}
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <strong>Required Fields:</strong> {selectedSchema.required.join(', ') || 'None'}
              </div>
            </div>

            <h4 style={{ marginTop: '1.5rem' }}>Credential Subject Properties</h4>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Property</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Type</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Required</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>SD-Eligible</th>
                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selectedSchema.credentialSubject.properties).map(([key, prop]) => {
                    const p = prop as SchemaProperty;
                    const isSD = selectedSchema.issuanceConfig?.selectiveDisclosure?.includes(key);
                    return (
                      <tr key={key} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '0.5rem', fontFamily: 'monospace' }}>{key}</td>
                        <td style={{ padding: '0.5rem' }}>{p.type}{p.enum ? ` (${p.enum.join('|')})` : ''}</td>
                        <td style={{ padding: '0.5rem' }}>{p.required ? 'Yes' : 'No'}</td>
                        <td style={{ padding: '0.5rem', color: isSD ? 'var(--color-issuer)' : 'inherit' }}>
                          {isSD ? 'Yes' : 'No'}
                        </td>
                        <td style={{ padding: '0.5rem', color: 'var(--color-text-secondary)' }}>{p.description || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {viewMode === 'create' && (
        <>
          <button className="btn btn-secondary" onClick={() => setViewMode('list')} style={{ marginBottom: '1rem' }}>
            Cancel
          </button>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Create New Schema</h3>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate(); }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div className="form-group">
                  <label className="form-label">Schema ID *</label>
                  <input className="form-input" value={formId} onChange={e => setFormId(e.target.value)} placeholder="MyCredentialType" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Name *</label>
                  <input className="form-input" value={formName} onChange={e => setFormName(e.target.value)} placeholder="My Credential" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Type *</label>
                  <input className="form-input" value={formType} onChange={e => setFormType(e.target.value)} placeholder="MyCredentialType" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Version *</label>
                  <input className="form-input" value={formVersion} onChange={e => setFormVersion(e.target.value)} placeholder="1.0.0" required />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Description *</label>
                  <input className="form-input" value={formDescription} onChange={e => setFormDescription(e.target.value)} placeholder="What this credential represents" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Subject Type</label>
                  <input className="form-input" value={formSubjectType} onChange={e => setFormSubjectType(e.target.value)} placeholder="Defaults to Type field" />
                </div>
                <div className="form-group">
                  <label className="form-label">Required Fields</label>
                  <input className="form-input" value={formRequired} onChange={e => setFormRequired(e.target.value)} placeholder="field1, field2 (comma separated)" />
                </div>
                <div className="form-group" style={{ gridColumn: 'span 2' }}>
                  <label className="form-label">Subject Properties (JSON) *</label>
                  <textarea
                    className="form-input"
                    value={formProperties}
                    onChange={e => setFormProperties(e.target.value)}
                    rows={6}
                    style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
                    placeholder='{"fieldName": {"type": "string", "description": "...", "required": true}}'
                    required
                  />
                  <div className="form-helper">JSON object mapping property names to their definitions</div>
                </div>
                <div className="form-group">
                  <label className="form-label">SD-Eligible Claims</label>
                  <input className="form-input" value={formSDClaims} onChange={e => setFormSDClaims(e.target.value)} placeholder="claim1, claim2 (comma separated)" />
                  <div className="form-helper">Claims that holders can selectively disclose</div>
                </div>
                <div className="form-group">
                  <label className="form-label">Validity (days)</label>
                  <input className="form-input" type="number" value={formValidityDays} onChange={e => setFormValidityDays(e.target.value)} min="1" />
                </div>
                <div className="form-group">
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formRevocable} onChange={e => setFormRevocable(e.target.checked)} />
                    Revocable
                  </label>
                </div>
              </div>

              <button type="submit" className="btn btn-issuer btn-lg" disabled={isSaving} style={{ width: '100%', marginTop: '1.5rem' }}>
                {isSaving ? 'Creating...' : 'Create Schema'}
              </button>
            </form>
          </div>
        </>
      )}
    </Layout>
  );
}
