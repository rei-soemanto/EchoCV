from pathlib import PurePosixPath

from app.config import repo_root


def test_repo_root_inside_the_repo():
    here = PurePosixPath("/work/EchoCV/services/speech/app/config.py")
    assert repo_root(here) == PurePosixPath("/work/EchoCV")


def test_repo_root_inside_the_deploy_image():
    assert repo_root(PurePosixPath("/srv/app/config.py")) == PurePosixPath("/srv")
