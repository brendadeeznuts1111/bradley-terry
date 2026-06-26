#!/usr/bin/env bash
# Bun CLI bash completions (generated from completions/bun-cli.json)
# Source this file or place it in /etc/bash_completion.d/ or ~/.bash_completion

_bun() {
	local cur prev words cword
	if type _init_completion >/dev/null 2>&1; then
		_init_completion || return
	else
		cur="${COMP_WORDS[COMP_CWORD]}"
		prev="${COMP_WORDS[COMP_CWORD-1]}"
	fi

	local commands="run test x repl exec install add remove update audit outdated link unlink publish patch pm info why build init create upgrade feedback"
	local global_flags="--silent --elide-lines -v --version --revision -F --filter -b --bun --no-orphans --shell --workspaces --parallel --sequential --no-exit-on-error --watch --hot --no-clear-screen --smol -r --preload --require --import --inspect --inspect-wait --inspect-brk --cpu-prof --cpu-prof-name --cpu-prof-dir --cpu-prof-md --cpu-prof-interval --heap-prof --heap-prof-name --heap-prof-dir --heap-prof-md --if-present --no-install --install --install=auto -i --i -e --eval -p --print --prefer-offline --prefer-latest --port --conditions --fetch-preconnect --experimental-http2-fetch --experimental-http3-fetch --max-http-header-size --dns-result-order --dns-result-order=verbatim --dns-result-order=(default) --dns-result-order=ipv4first --dns-result-order=ipv6first --experimental-stream-iter --expose-gc --no-deprecation --throw-deprecation --title --zero-fill-buffers --use-system-ca --use-openssl-ca --use-bundled-ca --redis-preconnect --sql-preconnect --no-addons --unhandled-rejections --unhandled-rejections=strict --console-depth --user-agent --cron-title --cron-period --main-fields --preserve-symlinks --preserve-symlinks-main --extension-order --tsconfig-override -d --define --drop --feature -l --loader --no-macros --jsx-factory --jsx-fragment --jsx-import-source --jsx-runtime --jsx-runtime=automatic --jsx-runtime=classic --jsx-side-effects --ignore-dce-annotations --env-file --no-env-file --cwd -c --config -h --help"

	# First argument after 'bun' is the command
	if [[ COMP_CWORD -eq 1 ]]; then
		COMPREPLY=( $(compgen -W "$commands" -- "$cur") )
		return 0
	fi

	local cmd="${COMP_WORDS[1]}"
	local cmd_flags=""
	case "$cmd" in
		run)
			cmd_flags=""
			;;
		test)
			cmd_flags="--no-orphans --timeout -u --update-snapshots --rerun-each --retry --todo --only --pass-with-no-tests --concurrent --randomize --seed --coverage --coverage-reporter --coverage-dir --bail -t --test-name-pattern --reporter --reporter-outfile --dots --only-failures --max-concurrency --path-ignore-patterns --changed --isolate --parallel --parallel-delay --test-worker --shard"
			;;
		x)
			cmd_flags="--bun -p --package --no-install --verbose --silent"
			;;
		repl)
			cmd_flags=""
			;;
		exec)
			cmd_flags=""
			;;
		install)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help -d --dev --optional --peer -E --exact -F --filter -a --analyze --only-missing"
			;;
		add)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help -d --dev --optional --peer -E --exact -a --analyze --only-missing"
			;;
		remove)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help"
			;;
		update)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help --latest -i --interactive --filter -r --recursive"
			;;
		audit)
			cmd_flags="--json --audit-level --ignore -p --production"
			;;
		outdated)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help -F --filter -r --recursive"
			;;
		link)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help"
			;;
		unlink)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help"
			;;
		publish)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help --access --tag --otp --auth-type --gzip-level --tolerate-republish"
			;;
		patch)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help --commit --patches-dir"
			;;
		pm)
			cmd_flags=""
			;;
		info)
			cmd_flags="-c --config -y --yarn -p --production --no-save --save --ca --cafile --dry-run --frozen-lockfile -f --force --cache-dir --no-cache --silent --quiet --verbose --no-progress --no-summary --no-verify --ignore-scripts --trust -g --global --cwd --backend --backend=clonefile --backend=hardlink --backend=symlink --backend=copyfile --registry --concurrent-scripts --network-concurrency --save-text-lockfile --omit --omit=dev --omit=optional --omit=peer --lockfile-only --linker --linker=isolated --linker=hoisted --minimum-release-age --cpu --cpu=arm64 --cpu=x64 --cpu=ia32 --cpu=ppc64 --cpu=s390x --os --os=linux --os=darwin --os=win32 --os=freebsd --os=openbsd --os=sunos --os=aix -h --help --json"
			;;
		why)
			cmd_flags="--top --depth"
			;;
		build)
			cmd_flags="--production --compile --compile-exec-argv --compile-autoload-dotenv --no-compile-autoload-dotenv --compile-autoload-bunfig --no-compile-autoload-bunfig --compile-autoload-tsconfig --no-compile-autoload-tsconfig --compile-autoload-package-json --no-compile-autoload-package-json --compile-executable-path --bytecode --watch --no-clear-screen --target --target=browser --target=bun --target=node --outdir --outfile --metafile --metafile-md --sourcemap --banner --footer --format --format=esm --format=cjs --format=iife --format=esm --format=cjs --root --splitting --public-path -e --external --allow-unresolved --reject-unresolved --packages --packages=external --packages=bundle --packages=bundle --entry-naming --chunk-naming --asset-naming --react-fast-refresh --react-compiler --no-bundle --emit-dce-annotations --minify --minify-syntax --minify-whitespace --minify-identifiers --keep-names --css-chunking --conditions --app --server-components --env --windows-hide-console --windows-icon --windows-title --windows-publisher --windows-version --windows-description --windows-copyright --debug-dump-server-files --debug-no-minify"
			;;
		init)
			cmd_flags="--help -y --yes -m --minimal -r --react --react --react --cwd"
			;;
		create)
			cmd_flags="--force --no-install --no-git --open"
			;;
		upgrade)
			cmd_flags="--canary --stable"
			;;
		feedback)
			cmd_flags=""
			;;
	esac

	COMPREPLY=( $(compgen -W "$cmd_flags $global_flags" -- "$cur") )
	return 0
}

complete -F _bun -o default bun
