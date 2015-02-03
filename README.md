# phantom-renderer
## Rendering server for SPA based on PhantomJS
---

### Single page renderer
- Copy/clone project
- Rename config.js.dist to config.js - and fill all config settings
- Run npm install
- Run like:

```javascript
    node index.js
```

### Multi page renderer
- Copy/clone project
- copy config.js.dist to configs/#SERVICE_NAME#.js - and fill all config settings (create one config file per page)
- Run npm install
- Run for each service like:

```javascript
    node index.js --config configs/#SERVICE_NAME#.js
```

### TODO
- update logger