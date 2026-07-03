#!/bin/bash


#NPM commands.

  #  /opt/homebridge/bin/node /opt/homebridge/bin/npm install --package-lock-only
  #  /opt/homebridge/bin/node /opt/homebridge/bin/npm install
  #  /opt/homebridge/bin/node /opt/homebridge/bin/npm list mqtt





#
echo Bug in this script, need to manually login first 

# npm login
# npm publish

who="$(npm whoami 2>/dev/null)"

version="$(cat package.json | grep version | cut -d'"' -f4)"
name="$(cat package.json | grep name | cut -d'"' -f4)"
echo "Current Version of $name is $version"
#echo $who

if [ "$who" == "sfeakes" ]; then
  npm publish
else
  echo -n "Enter password: "
  read -s passwd

  npm login << EOF
sfeakes
$passwd
sfeakes@gmail.com
EOF
 npm publish
fi
