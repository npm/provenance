# @npmcli/generate-provenance

Library for generating SLSA provenance on GitHub Actions and GitLab CI.

# Usage

```
import {generateProvenance} from '@npmcli/generate-provenance'

const provenanceStatement = generateProvenance({
  subject: [{
    name: '',
    digest: {
      alg: ''
    }
  }],
})
```
