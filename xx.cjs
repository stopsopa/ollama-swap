module.exports = (setup) => {
  return {
    help: {
      command: `
set -e  
# git config core.excludesFile .git/.gitignore_local

# source .env
# source .env.sh
export NODE_OPTIONS=""
        
cat <<EEE

  🐙 GitHub: $(git ls-remote --get-url origin | awk '{\$1=\$1};1' | tr -d '\\n' | sed -E 's/git@github\\.com:([^/]+)\\/(.+)\\.git/https:\\/\\/github.com\\/\\1\\/\\2/g')


EEE

      `,
      description: "Status of all things",
      source: false,
      confirm: false,
    },
    typecheck: {
      command: `
set -e  
NODE_OPTIONS="" npx tsc

      `,
      description: "Status of all things",
      source: false,
      confirm: false,
    },
    server: {
      command: `
set -e  
export PPORT="5090"
echo -e "\n    http://localhost:\${PPORT} \n" && python3 -m http.server \${PPORT}

      `,
      description: "Status of all things",
      source: false,
      confirm: false,
    },


    ...setup,
  };
};
