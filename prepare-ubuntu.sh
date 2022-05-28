sudo apt update
sudo apt upgrade -y

echo 
echo
echo "Set password for ubuntu user."
sudo passwd ubuntu

sudo apt install docker.io -y
sudo systemctl start docker
sudo systemctl enable docker
sudo groupadd docker
sudo usermod -aG docker $USER
if ! (grep -q docker /etc/group)
    then
        newgrp docker
    fi
docker ps

curl -sL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v

sudo npm install -g aws-cdk

sudo apt install python3-pip -y
sudo apt install virtualenv -y
virtualenv ~/venv -p /usr/bin/python3
source ~/venv/bin/activate
pip install boto3

sudo apt install awscli -y
echo 
echo
echo "Need to set only the region and format as json."
aws configure