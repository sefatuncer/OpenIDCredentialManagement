# Kubernetes Deployment

AI Agent Identity System Kubernetes deployment manifests using Kustomize.

## Directory Structure

```
k8s/
├── base/                          # Base manifests
│   ├── kustomization.yaml         # Kustomize configuration
│   ├── namespace.yaml             # Namespace definition
│   ├── configmap.yaml             # ConfigMap
│   ├── secret.yaml                # Secrets (use external management in prod)
│   ├── rbac.yaml                  # ServiceAccount, Role, RoleBinding
│   ├── api-gateway.yaml           # API Gateway Deployment, Service, HPA, PDB
│   ├── issuer.yaml                # Issuer Agent Deployment, Service, PVC
│   ├── verifier.yaml              # Verifier Agent Deployment, Service, PVC
│   ├── holder.yaml                # Holder Agent Deployment, Service, PVC
│   ├── postgres.yaml              # PostgreSQL StatefulSet, Service
│   ├── redis.yaml                 # Redis StatefulSet, Service
│   └── ingress.yaml               # Ingress, NetworkPolicy
│
└── overlays/
    ├── development/               # Development environment
    │   └── kustomization.yaml     # Dev-specific patches
    └── production/                # Production environment
        └── kustomization.yaml     # Prod-specific patches
```

## Prerequisites

- Kubernetes cluster (v1.25+)
- kubectl configured
- Kustomize (built into kubectl v1.14+)
- Ingress controller (nginx-ingress recommended)
- Storage class named "standard" (or modify PVCs)

## Quick Start

### Development Environment

```bash
# Preview the manifests
kubectl kustomize k8s/overlays/development

# Apply to cluster
kubectl apply -k k8s/overlays/development

# Check deployment status
kubectl -n ai-identity-dev get pods

# Access the API (port-forward)
kubectl -n ai-identity-dev port-forward svc/dev-api-gateway 3000:3000
```

### Production Environment

```bash
# Preview the manifests
kubectl kustomize k8s/overlays/production

# Apply to cluster
kubectl apply -k k8s/overlays/production

# Check deployment status
kubectl -n ai-identity-prod get pods
kubectl -n ai-identity-prod get hpa
kubectl -n ai-identity-prod get pdb
```

## Configuration

### Environment Variables

Edit the ConfigMap in `base/configmap.yaml` or use overlay patches:

| Variable | Description | Default |
|----------|-------------|---------|
| NODE_ENV | Environment | production |
| LOG_LEVEL | Logging level | info |
| API_PORT | HTTP port | 3000 |
| HTTPS_PORT | HTTPS port | 3443 |
| TLS_ENABLED | Enable TLS | false |

### Secrets

**IMPORTANT**: In production, use external secret management:
- HashiCorp Vault
- AWS Secrets Manager
- Azure Key Vault
- GCP Secret Manager
- Kubernetes External Secrets Operator

For development, secrets are in `base/secret.yaml`.

## Ingress Configuration

Update the ingress host in `base/ingress.yaml`:

```yaml
spec:
  rules:
    - host: your-domain.com  # Change this
```

### TLS with cert-manager

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Create ClusterIssuer
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF

# Uncomment cert-manager annotation in ingress.yaml
```

## Scaling

### Horizontal Pod Autoscaler

The API Gateway has HPA configured:
- Development: 1-2 replicas
- Production: 3-20 replicas

```bash
# Check HPA status
kubectl -n ai-identity-prod get hpa

# Manual scaling (if needed)
kubectl -n ai-identity-prod scale deployment prod-api-gateway --replicas=5
```

### Vertical Scaling

Edit resource limits in overlay patches or base manifests.

## Monitoring

### Prometheus Integration

All deployments have Prometheus annotations:
```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "3000"
  prometheus.io/path: "/metrics"
```

### Grafana Dashboard

Import the dashboard from `docker/grafana/dashboards/`.

## Troubleshooting

### Common Issues

1. **Pods not starting**
   ```bash
   kubectl -n ai-identity describe pod <pod-name>
   kubectl -n ai-identity logs <pod-name>
   ```

2. **PVC pending**
   ```bash
   kubectl get pvc -n ai-identity
   kubectl get storageclass
   ```

3. **Ingress not working**
   ```bash
   kubectl -n ai-identity describe ingress
   kubectl get events -n ai-identity
   ```

### Health Checks

```bash
# API health
kubectl -n ai-identity exec -it deployment/api-gateway -- curl localhost:3000/health

# Database connectivity
kubectl -n ai-identity exec -it deployment/api-gateway -- nc -zv postgres 5432

# Redis connectivity
kubectl -n ai-identity exec -it deployment/api-gateway -- nc -zv redis 6379
```

## Cleanup

```bash
# Delete development
kubectl delete -k k8s/overlays/development

# Delete production
kubectl delete -k k8s/overlays/production

# Delete namespace (removes everything)
kubectl delete namespace ai-identity-dev
kubectl delete namespace ai-identity-prod
```
