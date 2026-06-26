const fs = require('fs');
const file = '/home/user/Agent-Evolution-Platform/artifacts/algdevs-ai/src/pages/arena-workspace.tsx';
let content = fs.readFileSync(file, 'utf8');

const regex = /            <\/Panel>\n          <\/PanelGroup>\n        \)\}\n      <\/div>\n    <\/div>\n  \);\n\}/;
const replacement = `            </Panel>
          </PanelGroup>
        </div>
      )}
    </div>
  );
}`;

content = content.replace(regex, replacement);
fs.writeFileSync(file, content);
